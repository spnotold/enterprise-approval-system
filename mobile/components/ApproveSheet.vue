<script setup lang="ts">
// 同意 / 驳回面板：驳回理由必填（5–500 字），同意意见选填。
// 同意用滑轨确认（拖到最右端才提交，失败时滑块复位）；驳回填写理由后点按钮提交。
// 面板打开时生成幂等键，网络失败重试时复用同一个键。
import { computed, ref, watch } from 'vue'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import { newIdemKey } from '@/lib/idem'
import type { ActionResult } from '@/lib/types'
import BottomSheet from '@/components/BottomSheet.vue'
import SlideConfirm from '@/components/SlideConfirm.vue'
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
const focused = ref(false)
let idemKey = ''
const slider = ref<InstanceType<typeof SlideConfirm> | null>(null)

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

/** 返回是否已成功提交 */
async function submit(): Promise<boolean> {
  if (busy.value || props.taskId === null || props.appVersion === null) return false
  const text = comment.value.trim()
  if (isReject.value && (text.length < 5 || text.length > 500)) {
    error.value = '驳回理由需填写 5–500 字'
    return false
  }
  if (text.length > 500) {
    error.value = '审批意见不能超过 500 字'
    return false
  }
  busy.value = true
  try {
    for (;;) {
      try {
        const r = isReject.value
          ? await api.tasks.reject(props.taskId, { appVersion: props.appVersion, comment: text }, idemKey)
          : await api.tasks.approve(props.taskId, { appVersion: props.appVersion, comment: text || null }, idemKey)
        emit('done', r, props.mode)
        return true
      } catch (err) {
        const e = toApiError(err)
        if (e.isNetwork || e.code === 40903) {
          const again = await confirm({
            title: '操作未完成',
            content: e.code === 40903 ? '相同请求仍在处理中，是否稍后重试？' : '网络异常，是否重试？重试不会重复处理。',
            confirmText: '重试',
          })
          if (again) continue
          return false
        }
        if (e.isConflict) {
          emit('close')
          showError(e, { onRefresh: () => emit('refresh') })
          return false
        }
        const fieldMsg = e.errors.find((x) => x.field === 'comment')?.message
        error.value = fieldMsg || e.message
        if (!fieldMsg) showError(e)
        return false
      }
    }
  } finally {
    busy.value = false
  }
}

async function onSlideConfirm(): Promise<void> {
  if (!(await submit())) slider.value?.reset()
}
</script>

<template>
  <BottomSheet :visible="visible" :title="isReject ? '驳回申请' : '同意申请'" @close="emit('close')">
    <view class="field-label">
      <text v-if="isReject" class="req">*</text>{{ isReject ? '驳回理由' : '审批意见（选填）' }}
    </view>
    <textarea
      class="textarea"
      :class="{ 'is-error': !!error, 'is-focus': focused }"
      :value="comment"
      :placeholder="isReject ? '请说明驳回原因，5–500 字，申请人将看到该理由' : '可填写审批意见'"
      placeholder-class="placeholder"
      maxlength="500"
      :auto-height="true"
      :show-confirm-bar="false"
      @input="onInput"
      @focus="focused = true"
      @blur="focused = false"
    />
    <view class="row between">
      <view class="field-err">{{ error }}</view>
      <text class="count">{{ length }}/500</text>
    </view>
    <view v-if="isReject" class="field-help">驳回后本次审批结束，申请人可复制修改后重新提交。</view>
    <template #footer>
      <button v-if="isReject" class="btn btn-block btn-danger" :loading="busy" :disabled="busy" @tap="submit">
        确认驳回
      </button>
      <SlideConfirm v-else ref="slider" :loading="busy" :disabled="taskId === null" @confirm="onSlideConfirm" />
    </template>
  </BottomSheet>
</template>

<style scoped>
.textarea {
  width: 100%;
  min-height: 200rpx;
  background: var(--eas-paper);
  border: 2rpx solid transparent;
  border-radius: var(--eas-radius-control);
  color: var(--eas-ink);
  transition: border-color var(--eas-dur-fast) var(--eas-ease);
}

.textarea.is-focus {
  border-color: var(--eas-primary);
}

.textarea.is-error {
  background: var(--eas-danger-tint) !important;
  border-color: var(--eas-danger);
}

.count {
  flex-shrink: 0;
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}
</style>
