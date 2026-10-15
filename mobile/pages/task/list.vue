<script setup lang="ts">
// 待办 / 已办
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onReachBottom, onShow, onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/money'
import type { AppType, TaskItem } from '@/lib/types'
import AdminNotice from '@/components/AdminNotice.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { usePagedList } from '@/composables/usePagedList'
import { auth, requireLogin } from '@/stores/auth'
import { NOTICE_EVENT, notice, type IncomingNotice } from '@/stores/notice'
import { APP_TYPE_LABEL, TASK_STATUS_LABEL } from '@/utils/labels'
import { goDetail, goTaskHandle } from '@/utils/nav'
import { fmtShort } from '@/utils/time'

const tab = ref<'pending' | 'done'>('pending')
const type = ref<AppType | null>(null)
const keyword = ref('')
const ready = ref(false)
const updates = ref(0)

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

function onType(e: { detail: { value: number | string } }): void {
  type.value = TYPE_OPTIONS[Number(e.detail.value)].value
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
        <view class="seg-item" :class="{ active: tab === 'pending' }" @tap="switchTab('pending')">待办</view>
        <view class="seg-item" :class="{ active: tab === 'done' }" @tap="switchTab('done')">已办</view>
      </view>

      <view class="filter-bar">
        <picker :range="TYPE_OPTIONS" range-key="label" :value="typeIndex" @change="onType">
          <view class="filter-chip" :class="{ active: !!type }">
            {{ TYPE_OPTIONS[typeIndex].label }}
            <uni-icons type="bottom" size="12" color="#646a73" />
          </view>
        </picker>
        <view class="search flex1">
          <uni-icons type="search" size="16" color="#8f959e" />
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

      <view v-if="updates > 0" class="update-tip" @tap="reload">有 {{ updates }} 条更新，点击刷新</view>

      <view v-for="t in list.items.value" :key="t.taskId" class="card" @tap="open(t)">
        <view class="row between">
          <view class="row flex1">
            <text class="tag tag-blue">{{ APP_TYPE_LABEL[t.type] }}</text>
            <text class="bold ellipsis">{{ t.title || t.templateName }}</text>
          </view>
          <text v-if="t.amountCents !== null" class="amount">¥{{ formatCents(t.amountCents) }}</text>
        </view>
        <view class="muted line">{{ t.appNo }} · {{ t.applicant.realName }}<text v-if="t.deptName">（{{ t.deptName }}）</text></view>
        <view class="row between">
          <view class="row">
            <text class="tag">{{ t.nodeName }}</text>
            <text v-if="t.overdue && tab === 'pending'" class="tag tag-red">已超时</text>
            <text v-if="tab === 'done'" class="tag" :class="t.status === 'REJECTED' ? 'tag-red' : 'tag-green'">
              {{ TASK_STATUS_LABEL[t.status] }}
            </text>
            <StatusTag v-if="tab === 'done'" :status="t.appStatus" />
          </view>
          <text class="muted">{{ fmtShort(tab === 'done' ? t.actedAt : t.createdAt) }}</text>
        </view>
        <view v-if="tab === 'done' && t.comment" class="muted ellipsis line">意见：{{ t.comment }}</view>
      </view>

      <EmptyState
        v-if="list.loaded.value && !list.items.value.length"
        :text="hasFilter ? '没有符合条件的记录' : tab === 'pending' ? '暂无待办，休息一下' : '暂无已办记录'"
        :action-text="hasFilter ? '清空筛选' : ''"
        @action="clearFilter"
      />
      <uni-load-more v-else-if="list.items.value.length" :status="list.moreStatus.value" />
    </template>
  </view>
</template>

<style scoped>
.line {
  margin: 6rpx 0 10rpx;
}

.search {
  display: flex;
  align-items: center;
  height: 72rpx;
  padding: 0 20rpx;
  background: #fff;
  border-radius: 36rpx;
}

.search-input {
  flex: 1;
  height: 72rpx;
  margin-left: 8rpx;
  font-size: 26rpx;
}
</style>
