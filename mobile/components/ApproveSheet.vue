<script setup lang="ts">
// 批准 / 驳回面板：驳回理由必填（5–500 字），批准意见选填。
// 面板打开时生成幂等键，网络失败重试时复用同一个键。
import { computed, ref, watch } from 'vue'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import { newIdemKey } from '@/lib/idem'
import type { ActionResult } from '@/lib/types'
import BottomSheet from '@/components/BottomSheet.vue'
import { confirm, showError } from '@/utils/feedback'
import { inputValue, type UniInputEvent } from '@/utils/uniEvent'

const props = defineProps<{
  visible: boolean
  mode: 'approve' | 'reject'
  taskId: number | null
  appVersion: number | null
}>()

const emit = defineEmits<{
  close: []
  done: [result: ActionResult, mode: 'approve' | 'reject']
  /** 409：状态已变化 / 待办已被处理，页面需重新加载 */
  refresh: []
}>()

const comment = ref('')
const error = ref('')
const busy = ref(false)
let idemKey = ''

watch(
  () => props.visible,
  (v) => {
    if (v) {
      comment.value = ''
      error.value = ''
      idemKey = newIdemKey()
    }
  },
)

const isReject = computed(() => props.mode === 'reject')
const length = computed(() => comment.value.trim().length)

function onInput(e: Event | UniInputEvent): void {
  comment.value = inputValue(e)
  error.value = ''
}

async function submit(): Promise<void> {
  if (busy.value || props.taskId === null || props.appVersion === null) return
  const text = comment.value.trim()
  if (isReject.value && (text.length < 5 || text.length > 500)) {
    error.value = '驳回理由需填写 5–500 字'
    return
  }
  if (text.length > 500) {
    error.value = '审批意见不能超过 500 字'
    return
  }
  busy.value = true
  try {
    for (;;) {
      try {
        const r = isReject.value
          ? await api.tasks.reject(props.taskId, { appVersion: props.appVersion, comment: text }, idemKey)
          : await api.tasks.approve(props.taskId, { appVersion: props.appVersion, comment: text || null }, idemKey)
        emit('done', r, props.mode)
        return
      } catch (err) {
        const e = toApiError(err)
        if (e.isNetwork || e.code === 40903) {
          const again = await confirm({
            title: '操作未完成',
            content: e.code === 40903 ? '相同请求仍在处理中，是否稍后重试？' : '网络异常，是否重试？重试不会重复处理。',
            confirmText: '重试',
          })
          if (again) continue
          return
        }
        if (e.isConflict) {
          emit('close')
          showError(e, { onRefresh: () => emit('refresh') })
          return
        }
        const fieldMsg = e.errors.find((x) => x.field === 'comment')?.message
        error.value = fieldMsg || e.message
        if (!fieldMsg) showError(e)
        return
      }
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BottomSheet :visible="visible" :title="isReject ? '驳回申请' : '批准申请'" @close="emit('close')">
    <view class="field-label">
      <text v-if="isReject" class="req">*</text>{{ isReject ? '驳回理由' : '审批意见（选填）' }}
    </view>
    <textarea
      class="textarea"
      :class="{ 'is-error': !!error }"
      :value="comment"
      :placeholder="isReject ? '请说明驳回原因，5–500 字，申请人将看到该理由' : '可填写审批意见'"
      placeholder-class="placeholder"
      maxlength="500"
      :auto-height="true"
      :show-confirm-bar="false"
      @input="onInput"
    />
    <view class="row between">
      <view class="field-err">{{ error }}</view>
      <text class="muted">{{ length }}/500</text>
    </view>
    <view v-if="isReject" class="field-help">驳回后本次审批结束，申请人可复制修改后重新提交。</view>
    <template #footer>
      <button
        class="btn btn-block"
        :class="isReject ? 'btn-danger' : 'btn-primary'"
        :loading="busy"
        :disabled="busy"
        @tap="submit"
      >
        {{ isReject ? '确认驳回' : '确认批准' }}
      </button>
    </template>
  </BottomSheet>
</template>
