<script setup lang="ts">
// 批准 / 驳回面板：批准意见可选；驳回理由必填 5-500 字。
// 幂等键在弹窗打开时生成，同一弹窗内的重试复用同一个键。
import { computed, ref } from 'vue'
import { api } from '@/lib/api'
import type { ActionResult } from '@/lib/types'
import { newIdemKey } from '@/lib/idem'
import { useAction } from '@/composables/useAction'

const props = withDefaults(
  defineProps<{
    taskId: number
    /** 申请当前 version，作为 appVersion 提交 */
    appVersion: number
    canApprove?: boolean
    canReject?: boolean
  }>(),
  { canApprove: true, canReject: true },
)

const emit = defineEmits<{ done: [r: ActionResult]; refresh: [] }>()

type Mode = 'APPROVE' | 'REJECT'
const visible = ref(false)
const mode = ref<Mode>('APPROVE')
const comment = ref('')
const idemKey = ref('')
const touched = ref(false)
const { loading, run } = useAction()

const MIN_REJECT = 5
const MAX_LEN = 500
const length = computed(() => [...comment.value.trim()].length)
const error = computed(() => {
  if (length.value > MAX_LEN) return `不能超过 ${MAX_LEN} 字`
  if (mode.value === 'REJECT' && length.value < MIN_REJECT) return `请填写驳回理由（至少 ${MIN_REJECT} 字）`
  return null
})

function open(m: Mode) {
  mode.value = m
  comment.value = ''
  touched.value = false
  idemKey.value = newIdemKey() // 打开弹窗即生成幂等键
  visible.value = true
}

async function confirm() {
  touched.value = true
  if (error.value) return
  const text = comment.value.trim()
  const r = await run({
    idemKey: idemKey.value,
    action: (key) =>
      mode.value === 'APPROVE'
        ? api.tasks.approve(props.taskId, { appVersion: props.appVersion, comment: text || null }, key)
        : api.tasks.reject(props.taskId, { appVersion: props.appVersion, comment: text }, key),
    success: (res) =>
      mode.value === 'REJECT'
        ? '已驳回'
        : res.status === 'APPROVED'
          ? '已批准，审批流程结束'
          : `已批准，下一审批人：${res.currentNode?.assigneeName ?? '—'}`,
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
    <el-button v-if="canApprove" type="success" @click="open('APPROVE')">批准</el-button>
    <el-button v-if="canReject" type="danger" plain @click="open('REJECT')">驳回</el-button>

    <el-dialog
      v-model="visible"
      :title="mode === 'APPROVE' ? '批准申请' : '驳回申请'"
      width="min(520px, 94vw)"
      append-to-body
      :close-on-click-modal="!loading"
      :close-on-press-escape="!loading"
      :show-close="!loading"
    >
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
        <el-button :disabled="loading" @click="visible = false">取消</el-button>
        <el-button :type="mode === 'APPROVE' ? 'success' : 'danger'" :loading="loading" @click="confirm">
          {{ mode === 'APPROVE' ? '确认批准' : '确认驳回' }}
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
</style>
