<script setup lang="ts">
// 我的申请（卡片列表），按类型、状态筛选；部门负责人 / 被授权用户可切换本部门 / 授权范围
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onReachBottom, onShow, onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import type { AppStatus, AppType, ApplicationSummary, ListScope } from '@/lib/types'
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

const list = usePagedList<ApplicationSummary>((page, size) =>
  api.applications.list({
    scope: scope.value,
    page,
    size,
    type: type.value,
    status: scope.value === 'mine' ? status.value : status.value === 'DRAFT' ? null : status.value,
    keyword: keyword.value.trim() || null,
  }),
)

function reload(): void {
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

function onStatus(e: Event | UniPickerChangeEvent): void {
  status.value = STATUS_OPTIONS[Number(pickerValue(e))].value
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
  <view class="page">
    <view v-if="scopes.length > 1" class="seg">
      <view
        v-for="s in scopes"
        :key="s.value"
        class="seg-item"
        :class="{ active: scope === s.value }"
        @tap="setScope(s.value)"
      >
        {{ s.label }}
      </view>
    </view>

    <view class="filter-bar">
      <picker :range="TYPE_OPTIONS" range-key="label" :value="typeIndex" @change="onType">
        <view class="filter-chip" :class="{ active: !!type }">
          {{ TYPE_OPTIONS[typeIndex].label }}
          <uni-icons type="bottom" size="12" color="#646a73" />
        </view>
      </picker>
      <picker :range="STATUS_OPTIONS" range-key="label" :value="statusIndex" @change="onStatus">
        <view class="filter-chip" :class="{ active: !!status }">
          {{ STATUS_OPTIONS[statusIndex].label }}
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

    <view v-for="a in list.items.value" :key="a.id" @tap="goDetail(a.id)">
      <AppCard :app="a" :show-applicant="scope !== 'mine'" />
    </view>

    <EmptyState
      v-if="list.loaded.value && !list.items.value.length"
      :text="hasFilter ? '没有符合条件的记录' : '暂无申请'"
      :action-text="hasFilter ? '清空筛选' : ''"
      @action="clearFilter"
    />
    <uni-load-more v-else-if="list.items.value.length" :status="list.moreStatus.value" />
  </view>
</template>

<style scoped>
.search {
  display: flex;
  align-items: center;
  height: 72rpx;
  padding: 0 20rpx;
  background: #fff;
  border-radius: 36rpx;
  min-width: 0;
}

.search-input {
  flex: 1;
  height: 72rpx;
  margin-left: 8rpx;
  font-size: 26rpx;
  min-width: 0;
}
</style>
