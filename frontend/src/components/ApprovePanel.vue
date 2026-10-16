<script setup lang="ts">
// 同意 / 驳回面板：同意意见可选；驳回理由必填 5-500 字。按钮与结果提示用同一个动词（同意 → 已同意）。
// 幂等键在弹窗打开时生成，同一弹窗内的重试复用同一个键。
import { computed, onBeforeUnmount, ref } from 'vue'
import { api } from '@/lib/api'
import type { ActionResult } from '@/lib/types'
import { newIdemKey } from '@/lib/idem'
import { useAction } from '@/composables/useAction'
import { ApiError } from '@/lib/errors'
import { sessionGeneration } from '@/stores/auth'

const props = withDefaults(
  defineProps<{
    taskId: number
    /** 申请当前 version，作为 appVersion 提交 */
    appVersion: number
    disabled?: boolean
    refreshing?: boolean
    refreshError?: string | null
    canApprove?: boolean
    canReject?: boolean
  }>(),
  { canApprove: true, canReject: true, refreshing: false, refreshError: null },
)

const emit = defineEmits<{ done: [r: ActionResult]; refresh: [] }>()

type Mode = 'APPROVE' | 'REJECT'
const visible = ref(false)
const mode = ref<Mode>('APPROVE')
const comment = ref('')
const idemKey = ref('')
const touched = ref(false)
const { loading, run } = useAction()

let mounted = true
onBeforeUnmount(() => { mounted = false })
const MIN_REJECT = 5
const MAX_LEN = 500
const length = computed(() => [...comment.value.trim()].length)
const error = computed(() => {
  if (length.value > MAX_LEN) return `不能超过 ${MAX_LEN} 字`
  if (mode.value === 'REJECT' && length.value < MIN_REJECT) return `请填写驳回理由（至少 ${MIN_REJECT} 字）`
  return null
})

function open(m: Mode) {
  if (props.disabled || loading.value) return
  mode.value = m
  comment.value = ''
  touched.value = false
  idemKey.value = newIdemKey() // 打开弹窗即生成幂等键
  visible.value = true
}

async function confirm() {
  if (props.disabled || loading.value) return
  touched.value = true
  if (error.value) return
  const text = comment.value.trim()
  const generation = sessionGeneration()
  const taskId = props.taskId
  const appVersion = props.appVersion
  const r = await run({
    idemKey: idemKey.value,
    action: (key) => {
      if (!mounted || generation !== sessionGeneration()) throw new ApiError({ code: 40101, message: '登录身份或页面已变化，请重新打开申请' }, 401)
      if (props.disabled || taskId !== props.taskId || appVersion !== props.appVersion) throw new ApiError({ code: 40901, message: '申请状态已变化，请刷新后重新操作' }, 409)
      return mode.value === 'APPROVE'
        ? api.tasks.approve(taskId, { appVersion, comment: text || null }, key)
        : api.tasks.reject(taskId, { appVersion, comment: text }, key)
    },
    success: (res) =>
      mode.value === 'REJECT'
        ? '已驳回'
        : res.status === 'APPROVED'
          ? '已同意，审批流程结束'
          : `已同意，下一审批人：${res.currentNode?.assigneeName ?? '—'}`,
    onConflict: () => {
      visible.value = false
      emit('refresh')
    },
  })
  if (r) {
    visible.value = false
    emit('done', r)
  }
}
</script>

<template>
  <div class="approve-panel">
    <el-button v-if="canReject" :disabled="disabled || loading" class="reject-button" @click="open('REJECT')">驳回</el-button>
    <el-button v-if="canApprove" :disabled="disabled || loading" type="primary" @click="open('APPROVE')">同意</el-button>

    <el-dialog
      v-model="visible"
      :title="mode === 'APPROVE' ? '同意申请' : '驳回申请'"
      width="min(520px, 94vw)"
      append-to-body
      :close-on-click-modal="!loading"
      :close-on-press-escape="!loading"
      :show-close="!loading"
    >
      <el-alert
        v-if="refreshError"
        title="申请状态刷新失败，已保留审批意见"
        :description="refreshError"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-alert
        v-else-if="refreshing"
        title="正在更新申请状态，请稍候；已填写的意见会保留。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-alert
        v-if="mode === 'REJECT'"
        type="warning"
        :closable="false"
        show-icon
        title="驳回后本次审批结束，后续节点不再处理；申请人可“复制并修改”后重新提交。"
        style="margin-bottom: 12px"
      />
      <el-form label-position="top" @submit.prevent>
        <el-form-item
          :label="mode === 'APPROVE' ? '审批意见（可选）' : '驳回理由（必填，5-500 字）'"
          :required="mode === 'REJECT'"
          :error="touched && error ? error : ''"
        >
          <el-input
            v-model="comment"
            type="textarea"
            :rows="4"
            :maxlength="MAX_LEN"
            show-word-limit
            :placeholder="mode === 'APPROVE' ? '同意' : '请说明驳回原因，便于申请人修改'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="refreshError" :loading="refreshing" :disabled="refreshing || loading" @click="emit('refresh')">重新加载</el-button>
        <el-button :disabled="loading" @click="visible = false">取消</el-button>
        <el-button :type="mode === 'APPROVE' ? 'primary' : 'danger'" :loading="loading" :disabled="disabled" @click="confirm">
          {{ mode === 'APPROVE' ? '同意' : '驳回' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.approve-panel {
  display: inline-flex;
  gap: 8px;
}
.approve-panel .el-button + .el-button {
  margin-left: 0;
}
/* 驳回：次要描边按钮，悬停才露出赭色 */
.reject-button:not(.is-disabled):hover,
.reject-button:not(.is-disabled):focus-visible {
  border-color: var(--eas-danger);
  color: var(--eas-danger);
  background: var(--eas-danger-tint);
}
</style>
