<script setup lang="ts">
// 申请详情：业务信息、附件、纵向流程时间线、审批日志；
// 底部操作栏严格按 allowedActions 显示：编辑 / 删除 / 提交 / 撤回 / 复制并修改 / 催办 / 批准 / 驳回
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import { newIdemKey } from '@/lib/idem'
import type { ActionResult, AppAction, ApplicationDetail } from '@/lib/types'
import ApproveSheet from '@/components/ApproveSheet.vue'
import EmptyState from '@/components/EmptyState.vue'
import AppDetailBody from '@/components/detail/AppDetailBody.vue'
import { pathPreviewText } from '@/composables/useDraft'
import { requireLogin } from '@/stores/auth'
import { NOTICE_EVENT, type IncomingNotice } from '@/stores/notice'
import { runIdempotent } from '@/utils/action'
import { alert, confirm, hideLoading, loading, showError, toast } from '@/utils/feedback'
import { ACTION_LABEL } from '@/utils/labels'
import { goForm } from '@/utils/nav'
import { fmtDateTime } from '@/utils/time'

const id = ref(0)
const detail = ref<ApplicationDetail | null>(null)
const notFound = ref(false)
const sheet = ref<{ visible: boolean; mode: 'approve' | 'reject' }>({ visible: false, mode: 'approve' })

/** 操作在底部栏中的顺序：次要在左，主要在右 */
const ORDER: AppAction[] = ['DELETE', 'EDIT', 'COPY', 'URGE', 'WITHDRAW', 'SUBMIT', 'REJECT', 'APPROVE']
const PRIMARY: AppAction[] = ['SUBMIT', 'APPROVE', 'COPY']
const DANGER: AppAction[] = ['REJECT']

const actions = computed<AppAction[]>(() => {
  const d = detail.value
  if (!d) return []
  return ORDER.filter((a) => d.allowedActions.includes(a)).filter(
    (a) => (a !== 'APPROVE' && a !== 'REJECT') || d.myTaskId !== null,
  )
})
/** 最多直接显示 3 个按钮，其余收进“更多” */
const visibleActions = computed(() => (actions.value.length > 3 ? actions.value.slice(-2) : actions.value))
const moreActions = computed(() => (actions.value.length > 3 ? actions.value.slice(0, -2) : []))

async function load(silent = false): Promise<void> {
  if (!silent) loading()
  try {
    detail.value = await api.applications.detail(id.value)
    notFound.value = false
  } catch (err) {
    const e = toApiError(err)
    if (e.code === 40401 || e.httpStatus === 404) notFound.value = true
    else showError(e)
  } finally {
    if (!silent) hideLoading()
    uni.stopPullDownRefresh()
  }
}

function changed(): void {
  uni.$emit('eas:app-changed', id.value)
}

function handleError(err: unknown): void {
  const e = toApiError(err)
  if ((e.code === 42201 || e.code === 40000) && e.errors.length) {
    const lines = e.errors.map((x) => `· ${x.message}`).join('\n')
    if (detail.value?.allowedActions.includes('EDIT')) {
      void confirm({ title: '暂时无法提交', content: lines, confirmText: '去修改' }).then((ok) => {
        if (ok && detail.value) goForm(detail.value.type, { id: detail.value.id })
      })
    } else void alert('操作失败', lines)
    return
  }
  showError(e, { onRefresh: () => void load() })
}

async function doSubmit(d: ApplicationDetail): Promise<void> {
  let preview = null
  loading('生成审批路径')
  try {
    preview = await api.applications.pathPreview(d.id)
  } catch {
    preview = null
  } finally {
    hideLoading()
  }
  if (preview?.errors.length) return alert('暂时无法提交', preview.errors.join('\n'))
  const key = newIdemKey()
  const ok = await confirm({
    title: '确认提交',
    content: `${pathPreviewText(preview)}提交后进入审批流程，审批期间不能修改。`,
    confirmText: '提交',
  })
  if (!ok) return
  const r = await runIdempotent(key, (k) => api.applications.submit(d.id, { appVersion: d.version }, k), '提交中')
  if (r) afterAction(r, r.currentNode?.assigneeName ? `提交成功，当前审批人：${r.currentNode.assigneeName}` : '提交成功')
}

async function doWithdraw(d: ApplicationDetail): Promise<void> {
  const key = newIdemKey()
  const ok = await confirm({
    title: '撤回申请',
    content: '撤回后当前待办将失效，申请变为“已撤回”且不能再修改，可通过“复制并修改”重新提交。确定撤回？',
    confirmText: '撤回',
    danger: true,
  })
  if (!ok) return
  const r = await runIdempotent(key, (k) => api.applications.withdraw(d.id, { appVersion: d.version }, k), '撤回中')
  if (r) afterAction(r, '已撤回')
}

async function doUrge(d: ApplicationDetail): Promise<void> {
  const key = newIdemKey()
  const ok = await confirm({ title: '催办', content: '提醒当前审批人尽快处理？同一节点 4 小时内只能催办一次。' })
  if (!ok) return
  const r = await runIdempotent(key, (k) => api.applications.urge(d.id, k), '发送中')
  if (!r) return
  if (r.urged) toast('已提醒审批人', 'success')
  else toast(r.nextAllowedAt ? `催办过于频繁，${fmtDateTime(r.nextAllowedAt)} 后可再次催办` : '暂时不能催办')
}

async function doDelete(d: ApplicationDetail): Promise<void> {
  const ok = await confirm({ title: '删除草稿', content: '删除后不可恢复，确定删除？', confirmText: '删除', danger: true })
  if (!ok) return
  loading('删除中')
  try {
    await api.applications.remove(d.id)
    hideLoading()
    toast('已删除', 'success')
    changed()
    setTimeout(() => uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/home/index' }) }), 800)
  } catch (e) {
    hideLoading()
    handleError(e)
  }
}

async function doCopy(d: ApplicationDetail): Promise<void> {
  const ok = await confirm({ title: '复制并修改', content: '将以本单内容生成一张新草稿（新编号），原单保持不变。' })
  if (!ok) return
  loading('复制中')
  try {
    const r = await api.applications.copy(d.id)
    hideLoading()
    changed()
    goForm(d.type, { id: r.id })
  } catch (e) {
    hideLoading()
    handleError(e)
  }
}

function afterAction(_r: ActionResult, message: string): void {
  toast(message, 'none')
  changed()
  void load(true)
}

async function run(a: AppAction): Promise<void> {
  const d = detail.value
  if (!d) return
  try {
    switch (a) {
      case 'EDIT':
        goForm(d.type, { id: d.id })
        break
      case 'DELETE':
        await doDelete(d)
        break
      case 'SUBMIT':
        await doSubmit(d)
        break
      case 'WITHDRAW':
        await doWithdraw(d)
        break
      case 'COPY':
        await doCopy(d)
        break
      case 'URGE':
        await doUrge(d)
        break
      case 'APPROVE':
      case 'REJECT':
        sheet.value = { visible: true, mode: a === 'APPROVE' ? 'approve' : 'reject' }
        break
    }
  } catch (e) {
    handleError(e)
  }
}

function showMore(): void {
  const list = moreActions.value
  uni.showActionSheet({
    itemList: list.map((a) => ACTION_LABEL[a]),
    success: (r) => void run(list[r.tapIndex]),
  })
}

function onApproved(r: ActionResult, mode: 'approve' | 'reject'): void {
  sheet.value.visible = false
  afterAction(r, mode === 'approve' ? '已批准' : '已驳回')
}

// 实时提醒：正在看的这张单有新通知时自动刷新
const onNotice = (items: IncomingNotice[]) => {
  if (items.some((i) => i.applicationId === id.value)) void load(true)
}

onLoad(async (q) => {
  id.value = Number(q?.id)
  if (!(await requireLogin())) return
  if (!id.value) {
    notFound.value = true
    return
  }
  uni.$on(NOTICE_EVENT, onNotice)
  uni.$on('eas:app-changed', onChanged)
  await load()
})

/** 编辑页保存 / 提交后返回时刷新 */
function onChanged(changedId: number): void {
  if (changedId === id.value) void load(true)
}

onUnload(() => {
  uni.$off(NOTICE_EVENT, onNotice)
  uni.$off('eas:app-changed', onChanged)
})

onPullDownRefresh(() => void load(true))
</script>

<template>
  <view class="page" :class="{ 'page--bar': actions.length }">
    <EmptyState v-if="notFound" text="无权查看或申请已不存在" />
    <AppDetailBody v-else-if="detail" :detail="detail" />

    <view v-if="detail && actions.length" class="bottom-bar">
      <button v-if="moreActions.length" class="btn more-btn" @tap="showMore">更多</button>
      <button
        v-for="a in visibleActions"
        :key="a"
        class="btn"
        :class="{ 'btn-primary': PRIMARY.includes(a), 'btn-danger': DANGER.includes(a), 'btn-ghost-danger': a === 'DELETE' || a === 'WITHDRAW' }"
        @tap="run(a)"
      >
        {{ ACTION_LABEL[a] }}
      </button>
    </view>

    <ApproveSheet
      :visible="sheet.visible"
      :mode="sheet.mode"
      :task-id="detail?.myTaskId ?? null"
      :app-version="detail?.version ?? null"
      @close="sheet.visible = false"
      @done="onApproved"
      @refresh="load()"
    />
  </view>
</template>

<style scoped>
.more-btn {
  flex: 0 0 140rpx !important;
}
</style>
