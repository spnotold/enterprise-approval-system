<script setup lang="ts">
// 我的申请（卡片列表），按类型、状态筛选；部门负责人 / 被授权用户可切换本部门 / 授权范围
import { computed, ref } from 'vue'
import { onLoad, onPageScroll, onHide, onPullDownRefresh, onReachBottom, onShow, onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import type { AppAction, AppStatus, AppType, ApplicationDetail, ApplicationSummary, ListScope } from '@/lib/types'
import SwipeCell, { type SwipeAction } from '@/components/SwipeCell.vue'
import { closeSwipeCells, useSwipeTabs } from '@/composables/useSwipeTabs'
import { newIdemKey } from '@/lib/idem'
import { runIdempotent } from '@/utils/action'
import { confirm, hideLoading, loading, showError, toast } from '@/utils/feedback'
import { fmtDateTime } from '@/utils/time'
import AppCard from '@/components/AppCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import { usePagedList } from '@/composables/usePagedList'
import { auth, requireLogin } from '@/stores/auth'
import { NOTICE_EVENT } from '@/stores/notice'
import { APP_STATUS_LABEL, APP_STATUS_ORDER, APP_TYPE_LABEL } from '@/utils/labels'
import { goDetail } from '@/utils/nav'
import { pickerValue, type UniPickerChangeEvent } from '@/utils/uniEvent'

const scope = ref<ListScope>('mine')
const type = ref<AppType | null>(null)
const status = ref<AppStatus | null>(null)
const keyword = ref('')
const updates = ref(0)
let ready = false
let dirty = false

const TYPE_OPTIONS: { value: AppType | null; label: string }[] = [
  { value: null, label: '全部类型' },
  ...(Object.keys(APP_TYPE_LABEL) as AppType[]).map((t) => ({ value: t, label: APP_TYPE_LABEL[t] })),
]
const STATUS_OPTIONS: { value: AppStatus | null; label: string }[] = [
  { value: null, label: '全部状态' },
  ...APP_STATUS_ORDER.map((s) => ({ value: s, label: APP_STATUS_LABEL[s] })),
]
const typeIndex = computed(() => Math.max(0, TYPE_OPTIONS.findIndex((o) => o.value === type.value)))
const statusIndex = computed(() => Math.max(0, STATUS_OPTIONS.findIndex((o) => o.value === status.value)))

const scopes = computed(() => {
  const r: { value: ListScope; label: string }[] = [{ value: 'mine', label: '我的' }]
  if (auth.can('APP_READ_DEPT')) r.push({ value: 'dept', label: '本部门' })
  if (auth.can('APP_READ_GRANTED')) r.push({ value: 'granted', label: '授权范围' })
  return r
})
const hasFilter = computed(() => !!type.value || !!status.value || !!keyword.value.trim())

const actionDetails = ref<Record<number, ApplicationDetail>>({})
const busy = ref(false)
let listRequest = 0
const list = usePagedList<ApplicationSummary>(async (page, size) => {
  const request = ++listRequest
  const currentScope = scope.value
  const r = await api.applications.list({
    scope: currentScope, page, size, type: type.value,
    status: currentScope === 'mine' ? status.value : status.value === 'DRAFT' ? null : status.value,
    keyword: keyword.value.trim() || null,
  })
  if (request === listRequest && currentScope === 'mine') {
    for (const a of r.records) delete actionDetails.value[a.id]
    const details = await Promise.all(r.records.filter((a) => a.status === 'DRAFT' || a.status === 'IN_APPROVAL').map(async (a) => {
      try { return await api.applications.detail(a.id) } catch { return null }
    }))
    if (request === listRequest) {
      for (const d of details) if (d) actionDetails.value[d.id] = d
    }
  }
  return r
})

function actionsFor(a: ApplicationSummary): SwipeAction[] {
  if (scope.value !== 'mine' || busy.value) return []
  const d = actionDetails.value[a.id]
  if (!d || d.version !== a.version || d.status !== a.status) return []
  const actions: SwipeAction[] = []
  if (a.status === 'IN_APPROVAL') {
    if (d.allowedActions.includes('URGE')) actions.push({ key: 'URGE', text: '催办', type: 'primary' })
    if (d.allowedActions.includes('WITHDRAW')) actions.push({ key: 'WITHDRAW', text: '撤回', type: 'danger' })
  }
  if (a.status === 'DRAFT' && d.allowedActions.includes('DELETE')) actions.push({ key: 'DELETE', text: '删除', type: 'danger' })
  return actions
}

async function runAction(a: ApplicationSummary, key: string): Promise<void> {
  if (busy.value || !actionsFor(a).some((x) => x.key === key)) return
  busy.value = true
  try {
    const d = await api.applications.detail(a.id)
    if (!d.allowedActions.includes(key as AppAction)) { toast('申请状态已变化，请刷新后查看'); reload(); return }
    const idemKey = newIdemKey()
    if (key === 'URGE') {
      if (!(await confirm({ title: '催办', content: '提醒当前审批人尽快处理？同一节点 4 小时内只能催办一次。' }))) return
      const r = await runIdempotent(idemKey, (k) => api.applications.urge(d.id, k), '发送中')
      if (!r) return
      if (r.urged) toast('已提醒审批人', 'success')
      else toast(r.nextAllowedAt ? `催办过于频繁，${fmtDateTime(r.nextAllowedAt)} 后可再次催办` : '暂时不能催办')
    } else if (key === 'WITHDRAW') {
      if (!(await confirm({ title: '撤回申请', content: '撤回后当前待办将失效，申请变为“已撤回”且不能再修改，可通过“复制并修改”重新提交。确定撤回？', confirmText: '撤回', danger: true }))) return
      const r = await runIdempotent(idemKey, (k) => api.applications.withdraw(d.id, { appVersion: d.version }, k), '撤回中')
      if (!r) return
      toast('已撤回')
    } else if (key === 'DELETE') {
      if (!(await confirm({ title: '删除草稿', content: '删除后不可恢复，确定删除？', confirmText: '删除', danger: true }))) return
      loading('删除中')
      await api.applications.remove(d.id)
      hideLoading()
      toast('已删除', 'success')
    }
    uni.$emit('eas:app-changed', d.id)
    reload()
  } catch (e) { showError(e, { onRefresh: reload }) }
  finally { busy.value = false }
}

function selectStatus(i: number): void {
  if (status.value === STATUS_OPTIONS[i].value) return
  status.value = STATUS_OPTIONS[i].value
  reload()
}
const swipe = useSwipeTabs(statusIndex, () => STATUS_OPTIONS.length, selectStatus)
onPageScroll(closeSwipeCells)
onHide(closeSwipeCells)

function reload(): void {
  closeSwipeCells()
  updates.value = 0
  void list.reload()
}

function setScope(s: ListScope): void {
  if (scope.value === s) return
  scope.value = s
  uni.setNavigationBarTitle({ title: s === 'mine' ? '我的申请' : s === 'dept' ? '本部门申请' : '授权范围申请' })
  reload()
}

function onType(e: Event | UniPickerChangeEvent): void {
  type.value = TYPE_OPTIONS[Number(pickerValue(e))].value
  reload()
}


function clearFilter(): void {
  type.value = null
  status.value = null
  keyword.value = ''
  reload()
}

const onNotice = () => {
  updates.value++
}

onLoad(async (q) => {
  if (q?.status && q.status in APP_STATUS_LABEL) status.value = q.status as AppStatus
  if (q?.type && q.type in APP_TYPE_LABEL) type.value = q.type as AppType
  if (!(await requireLogin())) return
  if (q?.scope === 'dept' && auth.can('APP_READ_DEPT')) setScope('dept')
  else if (q?.scope === 'granted' && auth.can('APP_READ_GRANTED')) setScope('granted')
  else reload()
  ready = true
  uni.$on(NOTICE_EVENT, onNotice)
  uni.$on('eas:app-changed', markDirty)
})

/** 详情页发生删除、撤回、提交等操作后，返回列表时刷新 */
function markDirty(): void {
  dirty = true
}

onShow(() => {
  if (ready && dirty) {
    dirty = false
    reload()
  }
})

onUnload(() => {
  uni.$off(NOTICE_EVENT, onNotice)
  uni.$off('eas:app-changed', markDirty)
})
onPullDownRefresh(() => reload())
onReachBottom(() => void list.loadMore())
</script>

<template>
  <view class="page" @tap="closeSwipeCells">
    <view v-if="scopes.length > 1" class="seg">
      <view class="seg-indicator" :style="{ width: `calc((100% - 12rpx) / ${scopes.length})`, transform: `translateX(${scopes.findIndex((s) => s.value === scope) * 100}%)` }" />
      <view
        v-for="s in scopes"
        :key="s.value"
        class="seg-item"
        :class="{ active: scope === s.value }"
        hover-class="is-pressed" hover-stay-time="60" @tap="setScope(s.value)"
      >
        {{ s.label }}
      </view>
    </view>

    <view class="filter-bar">
      <picker :range="TYPE_OPTIONS" range-key="label" :value="typeIndex" @change="onType">
        <view hover-class="is-pressed" hover-stay-time="60" class="filter-chip" :class="{ active: !!type }">
          {{ TYPE_OPTIONS[typeIndex].label }}
          <uni-icons type="bottom" size="12" color="var(--eas-ink-2)" />
        </view>
      </picker>
      <view class="search flex1">
        <uni-icons type="search" size="16" color="var(--eas-ink-3)" />
        <input
          v-model="keyword"
          class="search-input"
          placeholder="编号或标题"
          placeholder-class="placeholder"
          confirm-type="search"
          @confirm="reload"
        />
      </view>
    </view>

    <view class="seg status-tabs">
      <view class="seg-indicator" :style="{ width: `calc((100% - 12rpx) / ${STATUS_OPTIONS.length})`, transform: `translateX(${statusIndex * 100}%)` }" />
      <view v-for="(s, i) in STATUS_OPTIONS" :key="s.value ?? 'all'" class="seg-item" :class="{ active: statusIndex === i }" hover-class="is-pressed" hover-stay-time="60" @tap="selectStatus(i)">{{ s.value ? s.label : '全部' }}</view>
    </view>

    <view v-if="updates > 0" class="update-tip" hover-class="is-pressed" hover-stay-time="60" @tap="reload">有 {{ updates }} 条更新，点击刷新</view>

    <view class="list-area" @touchstart="swipe.onTouchStart" @touchmove="swipe.onTouchMove" @touchend="swipe.onTouchEnd" @touchcancel="swipe.onTouchCancel">
      <SwipeCell v-for="a in list.items.value" :key="a.id" :cell-id="`app-${a.id}`" :actions="actionsFor(a)" @content-tap="!swipe.suppressTap.value && goDetail(a.id)" @action="runAction(a, $event)">
        <AppCard :app="a" :show-applicant="scope !== 'mine'" flush />
      </SwipeCell>

      <EmptyState
        v-if="list.loaded.value && !list.items.value.length"
        :text="hasFilter ? '没有符合条件的记录' : '暂无申请'"
        :action-text="hasFilter ? '清空筛选' : ''"
        @action="clearFilter"
      />
      <uni-load-more v-else-if="list.items.value.length" :status="list.moreStatus.value" :content-text="{ contentdown: '上拉加载更多', contentrefresh: '加载中', contentnomore: '没有更多记录' }" />
    </view>
  </view>
</template>

<style scoped>
.list-area { min-height: 55vh; touch-action: pan-y; }
.status-tabs .seg-item { font-size: var(--eas-fs-xs); }
.search {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 20rpx;
  background: var(--eas-surface);
  border-radius: var(--eas-radius-control);
  min-width: 0;
}

.search-input {
  flex: 1;
  height: 88rpx;
  margin-left: 8rpx;
  font-size: 26rpx;
  min-width: 0;
}
</style>
