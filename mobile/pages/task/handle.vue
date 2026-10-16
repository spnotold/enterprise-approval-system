<script setup lang="ts">
// 审批：申请摘要与签批栏 + 底部“驳回 / 同意”双按钮；同意在面板里滑动确认
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import type { ActionResult, ApplicationDetail } from '@/lib/types'
import ApproveSheet from '@/components/ApproveSheet.vue'
import EmptyState from '@/components/EmptyState.vue'
import AppDetailBody from '@/components/detail/AppDetailBody.vue'
import { requireLogin } from '@/stores/auth'
import { NOTICE_EVENT, type IncomingNotice } from '@/stores/notice'
import { hideLoading, loading, showError, toast } from '@/utils/feedback'

const appId = ref(0)
const taskId = ref<number | null>(null)
const detail = ref<ApplicationDetail | null>(null)
const notFound = ref(false)
const done = ref(false)
const sheet = ref<{ visible: boolean; mode: 'approve' | 'reject' }>({ visible: false, mode: 'approve' })
/** 本次同意 / 驳回的节点：刷新后该签批格落章（只播一次） */
const stampSeq = ref<number | null>(null)

/** 当前用户在本单上仍有待处理的待办 */
const myTask = computed(() => {
  const d = detail.value
  if (!d || done.value || d.myTaskId === null) return null
  if (taskId.value !== null && d.myTaskId !== taskId.value) return d.myTaskId // 待办已转换（如转办后重新分配）
  return d.myTaskId
})
const canApprove = computed(() => !!detail.value?.allowedActions.includes('APPROVE'))
const canReject = computed(() => !!detail.value?.allowedActions.includes('REJECT'))

async function load(silent = false): Promise<void> {
  if (!silent) loading()
  try {
    detail.value = await api.applications.detail(appId.value)
  } catch (err) {
    const e = toApiError(err)
    if (e.code === 40401 || e.httpStatus === 404) notFound.value = true
    else showError(e)
  } finally {
    if (!silent) hideLoading()
    uni.stopPullDownRefresh()
  }
}

function open(mode: 'approve' | 'reject'): void {
  sheet.value = { visible: true, mode }
}

function onDone(r: ActionResult, mode: 'approve' | 'reject'): void {
  sheet.value.visible = false
  done.value = true
  stampSeq.value = detail.value?.currentNodeSeq ?? null
  uni.$emit('eas:app-changed', appId.value)
  const next = r.currentNode?.assigneeName ? `，已流转至${r.currentNode.name}（${r.currentNode.assigneeName}）` : ''
  toast(mode === 'approve' ? `已同意${r.status === 'APPROVED' ? '，审批完成' : next}` : '已驳回', 'none')
  void load(true)
  setTimeout(() => uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/task/list' }) }), 1500)
}

const onNotice = (items: IncomingNotice[]) => {
  if (items.some((i) => i.applicationId === appId.value)) void load(true)
}

onLoad(async (q) => {
  appId.value = Number(q?.id)
  taskId.value = q?.taskId ? Number(q.taskId) : null
  if (!(await requireLogin())) return
  if (!appId.value) {
    notFound.value = true
    return
  }
  uni.$on(NOTICE_EVENT, onNotice)
  await load()
})

onUnload(() => uni.$off(NOTICE_EVENT, onNotice))
onPullDownRefresh(() => void load(true))
</script>

<template>
  <view class="page" :class="{ 'page--bar': !!myTask }">
    <EmptyState v-if="notFound" text="无权查看或申请已不存在" />
    <template v-else-if="detail">
      <view v-if="!myTask" class="banner banner-warning">该待办已处理或已失效，当前无需你审批。</view>
      <AppDetailBody :detail="detail" :stamp-seq="stampSeq" />
    </template>

    <view v-if="detail && myTask" class="bottom-bar">
      <button class="btn btn-ghost-danger" :disabled="!canReject" @tap="open('reject')">驳回</button>
      <button class="btn btn-primary" :disabled="!canApprove" @tap="open('approve')">同意</button>
    </view>

    <ApproveSheet
      :visible="sheet.visible"
      :mode="sheet.mode"
      :task-id="myTask"
      :app-version="detail?.version ?? null"
      @close="sheet.visible = false"
      @done="onDone"
      @refresh="load()"
    />
  </view>
</template>
