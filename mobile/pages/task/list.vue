<script setup lang="ts">
// 待办 / 已办
import { computed, ref } from 'vue'
import { onLoad, onPageScroll, onPullDownRefresh, onReachBottom, onShow, onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/money'
import type { AppType, TaskItem } from '@/lib/types'
import AdminNotice from '@/components/AdminNotice.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { closeSwipeCells, useSwipeTabs } from '@/composables/useSwipeTabs'
import { usePagedList } from '@/composables/usePagedList'
import { auth, requireLogin } from '@/stores/auth'
import { NOTICE_EVENT, notice, type IncomingNotice } from '@/stores/notice'
import { APP_TYPE_LABEL } from '@/utils/labels'
import { goDetail, goTaskHandle } from '@/utils/nav'
import { fmtShort } from '@/utils/time'
import { pickerValue, type UniPickerChangeEvent } from '@/utils/uniEvent'

const tab = ref<'pending' | 'done'>('pending')
const type = ref<AppType | null>(null)
const keyword = ref('')
const ready = ref(false)
const updates = ref(0)
const searchFocus = ref(false)

const TYPE_OPTIONS: { value: AppType | null; label: string }[] = [
  { value: null, label: '全部类型' },
  { value: 'PURCHASE', label: '采购' },
  { value: 'TRAVEL', label: '差旅' },
  { value: 'EXPENSE', label: '报销' },
  { value: 'CUSTOM', label: '自定义' },
]
const typeIndex = computed(() => Math.max(0, TYPE_OPTIONS.findIndex((o) => o.value === type.value)))

const adminOnly = computed(() => auth.isAdminOnly)
const canHandle = computed(() => auth.can('TASK_HANDLE'))
const hasFilter = computed(() => !!type.value || !!keyword.value.trim())

const list = usePagedList<TaskItem>((page, size) => {
  const q = { page, size, type: type.value, keyword: keyword.value.trim() || null }
  return tab.value === 'pending' ? api.tasks.pending(q) : api.tasks.done(q)
})

function reload(): void {
  updates.value = 0
  void list.reload()
}

function switchTab(t: 'pending' | 'done'): void {
  if (tab.value === t) return
  tab.value = t
  reload()
}

function onType(e: Event | UniPickerChangeEvent): void {
  type.value = TYPE_OPTIONS[Number(pickerValue(e))].value
  reload()
}

function clearFilter(): void {
  type.value = null
  keyword.value = ''
  reload()
}

function open(t: TaskItem): void {
  if (tab.value === 'pending') goTaskHandle(t.taskId, t.applicationId)
  else goDetail(t.applicationId)
}

const swipeIndex = computed(() => tab.value === 'pending' ? 0 : 1)
const swipe = useSwipeTabs(swipeIndex, () => 2, (i) => switchTab(i === 0 ? 'pending' : 'done'))
onPageScroll(closeSwipeCells)

const onNotice = (items: IncomingNotice[]) => {
  updates.value += items.filter((i) => i.type !== 'REGISTRATION_APPROVED').length
}

onLoad(async () => {
  if (!(await requireLogin())) return
  ready.value = true
  uni.$on(NOTICE_EVENT, onNotice)
  if (canHandle.value) reload()
})

onShow(() => {
  notice.applyBadge()
  // 从审批页返回后刷新待办
  if (ready.value && canHandle.value && list.loaded.value) reload()
})

onUnload(() => uni.$off(NOTICE_EVENT, onNotice))
onPullDownRefresh(() => (canHandle.value ? reload() : uni.stopPullDownRefresh()))
onReachBottom(() => void list.loadMore())
</script>

<template>
  <view class="page">
    <AdminNotice v-if="adminOnly" />
    <view v-else-if="ready && !canHandle" class="card muted">当前账号没有审批权限。</view>
    <template v-else-if="ready">
      <view class="seg">
        <view class="seg-indicator" :style="{ width: 'calc((100% - 12rpx) / 2)', transform: `translateX(${swipeIndex * 100}%)` }" />
        <view class="seg-item" :class="{ active: tab === 'pending' }" hover-class="is-pressed" hover-stay-time="60" @tap="switchTab('pending')">待办</view>
        <view class="seg-item" :class="{ active: tab === 'done' }" hover-class="is-pressed" hover-stay-time="60" @tap="switchTab('done')">已办</view>
      </view>

      <view class="filter-bar">
        <picker :range="TYPE_OPTIONS" range-key="label" :value="typeIndex" @change="onType">
          <view hover-class="is-pressed" hover-stay-time="60" class="filter-chip" :class="{ active: !!type }">
            {{ TYPE_OPTIONS[typeIndex].label }}
            <uni-icons type="bottom" size="12" color="var(--eas-ink-2)" />
          </view>
        </picker>
        <view class="search flex1" :class="{ 'is-focus': searchFocus }">
          <uni-icons type="search" size="16" color="var(--eas-ink-3)" />
          <input
            v-model="keyword"
            class="search-input"
            placeholder="编号或标题"
            placeholder-class="placeholder"
            confirm-type="search"
            @confirm="reload"
            @focus="searchFocus = true"
            @blur="searchFocus = false"
          />
        </view>
      </view>

      <view v-if="updates > 0" class="update-tip" hover-class="is-pressed" hover-stay-time="60" @tap="reload">有 {{ updates }} 条更新，点击刷新</view>

      <view class="list-area" @touchstart="swipe.onTouchStart" @touchmove="swipe.onTouchMove" @touchend="swipe.onTouchEnd" @touchcancel="swipe.onTouchCancel">
        <view v-for="t in list.items.value" :key="t.taskId" class="card" hover-class="is-pressed" hover-stay-time="60" @tap="!swipe.suppressTap.value && open(t)">
          <view class="row between">
            <view class="row flex1">
              <text class="tag">{{ APP_TYPE_LABEL[t.type] }}</text>
              <text class="title ellipsis">{{ t.title || t.templateName }}</text>
            </view>
            <text v-if="t.amountCents !== null" class="amount card-amount">¥{{ formatCents(t.amountCents) }}</text>
          </view>
          <view class="line muted"><text class="ellipsis app-no">{{ t.appNo }}</text><text class="applicant">{{ t.applicant.realName }}<text v-if="t.deptName">（{{ t.deptName }}）</text></text></view>
          <view class="row between last-line">
            <view class="row flex1">
              <text v-if="tab === 'pending'" class="tag tag-blue">{{ t.nodeName }}</text>
              <StatusTag v-else :status="t.appStatus" />
              <text v-if="t.overdue && tab === 'pending'" class="tag tag-orange">已超时</text>
            </view>
            <text class="muted">{{ fmtShort(tab === 'done' ? t.actedAt : t.createdAt) }}</text>
          </view>
          <view v-if="tab === 'done' && t.comment" class="muted ellipsis line comment">意见：{{ t.comment }}</view>
        </view>

        <EmptyState
          v-if="list.loaded.value && !list.items.value.length"
          :kind="hasFilter ? 'search' : 'tray'"
          :text="hasFilter ? '没有符合条件的记录' : tab === 'pending' ? '暂无待办' : '暂无已办记录'"
          :action-text="hasFilter ? '清空筛选' : ''"
          @action="clearFilter"
        />
        <uni-load-more v-else-if="list.items.value.length" :status="list.moreStatus.value" :content-text="{ contentdown: '上拉加载更多', contentrefresh: '加载中', contentnomore: '没有更多记录' }" />
      </view>
    </template>
  </view>
</template>

<style scoped>
.list-area { min-height: 55vh; touch-action: pan-y; }

/* 第一行标题：600 单行截断 */
.title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: var(--eas-ink);
}

/* 金额：展示字数字靠右 */
.card-amount {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 30rpx;
}

/* 第二行：单号 + 申请人（部门） */
.applicant { margin-left: 16rpx; }

.app-no { margin-right: 4rpx; }

.line {
  margin-top: 14rpx;
}

.last-line {
  margin-top: 14rpx;
  min-height: 44rpx;
}

.comment {
  margin-top: 12rpx;
}

/* 搜索框：field 底胶囊，聚焦墨线框 + 芥黄错版（.is-focus 全局） */
.search {
  display: flex;
  align-items: center;
  height: 72rpx;
  margin: 8rpx 0;
  padding: 0 24rpx;
  background: var(--eas-field);
  border: 3rpx solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-pill);
  transition: border-color var(--eas-dur-fast) var(--eas-ease), box-shadow var(--eas-dur-fast) var(--eas-ease);
}

.search-input {
  flex: 1;
  height: 100%;
  margin-left: 12rpx;
  font-size: 26rpx;
  min-width: 0;
}
</style>
