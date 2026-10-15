<script setup lang="ts">
// 工作台：待办数、我的申请状态、最近通知、快捷发起
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/money'
import type { NotificationItem, PersonalStats, TemplateOption } from '@/lib/types'
import AdminNotice from '@/components/AdminNotice.vue'
import { auth, requireLogin } from '@/stores/auth'
import { notice } from '@/stores/notice'
import { showError } from '@/utils/feedback'
import { APP_STATUS_COLOR, APP_STATUS_LABEL, APP_STATUS_ORDER, APP_TYPE_LABEL } from '@/utils/labels'
import { go, goAppList, goForm, openLink } from '@/utils/nav'
import { fmtShort } from '@/utils/time'

const ready = ref(false)
const stats = ref<PersonalStats | null>(null)
const notices = ref<NotificationItem[]>([])
const templates = ref<TemplateOption[]>([])
const loading = ref(false)

const me = computed(() => auth.state.me)
const adminOnly = computed(() => auth.isAdminOnly)
const canHandle = computed(() => auth.can('TASK_HANDLE'))
const canCreate = computed(() => auth.can('APP_CREATE'))

const greeting = computed(() => {
  const h = (new Date().getUTCHours() + 8) % 24
  return h < 6 ? '夜深了' : h < 12 ? '上午好' : h < 18 ? '下午好' : '晚上好'
})

async function load(): Promise<void> {
  if (loading.value) return
  loading.value = true
  try {
    if (adminOnly.value) {
      notices.value = (await api.notifications.list({ page: 1, size: 5 })).records
      return
    }
    const [s, n, t] = await Promise.all([
      api.stats.personal(),
      api.notifications.list({ page: 1, size: 5 }),
      canCreate.value ? api.templates.available() : Promise.resolve([] as TemplateOption[]),
    ])
    stats.value = s
    notices.value = n.records
    templates.value = t
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

onLoad(async () => {
  if (!(await requireLogin())) return
  ready.value = true
  await load()
})

onShow(() => {
  notice.applyBadge()
  if (ready.value) void load()
})

onPullDownRefresh(() => {
  void load()
})

async function tapNotice(n: NotificationItem): Promise<void> {
  if (!n.read) {
    try {
      await api.notifications.markRead(n.id)
      n.read = true
      notice.decrease()
    } catch {
      // 标记失败不影响跳转
    }
  }
  openLink(n)
}

function startTemplate(t: TemplateOption): void {
  goForm(t.bizType, { templateId: t.category === 'CUSTOM' ? t.id : null })
}
</script>

<template>
  <view class="page">
    <view class="hello">
      <view class="hello-title">{{ greeting }}，{{ me?.realName ?? '' }}</view>
      <view class="muted">{{ me?.deptName ?? '' }}</view>
    </view>

    <AdminNotice v-if="adminOnly" />

    <template v-else-if="ready">
      <view class="kpis">
        <view v-if="canHandle" class="kpi" @tap="go('/pages/task/list')">
          <view class="kpi-value text-primary">{{ stats?.pendingTaskCount ?? '—' }}</view>
          <view class="kpi-label">我的待办</view>
        </view>
        <view class="kpi" @tap="goAppList({ status: 'APPROVED' })">
          <view class="kpi-value">{{ stats?.approvedCount ?? '—' }}</view>
          <view class="kpi-label">已通过申请</view>
        </view>
        <view class="kpi" @tap="go('/pages/stats/index')">
          <view class="kpi-value kpi-money">¥{{ stats ? formatCents(stats.approvedAmountCents) : '—' }}</view>
          <view class="kpi-label">已通过金额</view>
        </view>
      </view>

      <view class="card">
        <view class="card-title">
          我的申请
          <view class="link-btn" @tap="goAppList()">全部</view>
        </view>
        <view class="status-grid">
          <view v-for="s in APP_STATUS_ORDER" :key="s" class="status-cell" @tap="goAppList({ status: s })">
            <view class="status-count" :style="{ color: APP_STATUS_COLOR[s] }">{{ stats?.statusCounts?.[s] ?? 0 }}</view>
            <view class="muted">{{ APP_STATUS_LABEL[s] }}</view>
          </view>
        </view>
      </view>

      <view v-if="templates.length" class="card">
        <view class="card-title">
          快捷发起
          <view class="link-btn" @tap="go('/pages/apply/index')">更多</view>
        </view>
        <view class="quick">
          <view v-for="t in templates.slice(0, 6)" :key="t.id" class="quick-item" @tap="startTemplate(t)">
            <view class="quick-icon">{{ t.name.slice(0, 1) }}</view>
            <text class="quick-name ellipsis">{{ t.name }}</text>
            <text class="muted">{{ APP_TYPE_LABEL[t.bizType] }}</text>
          </view>
        </view>
      </view>
    </template>

    <view class="card">
      <view class="card-title">
        最近通知
        <view class="link-btn" @tap="go('/pages/notice/list')">全部</view>
      </view>
      <view v-if="!notices.length" class="muted">暂无通知</view>
      <view v-for="n in notices" :key="n.id" class="notice" @tap="tapNotice(n)">
        <view v-if="!n.read" class="dot" />
        <view class="flex1">
          <view class="ellipsis" :class="{ bold: !n.read }">{{ n.title }}</view>
          <view class="muted">{{ fmtShort(n.createdAt) }}</view>
        </view>
        <uni-icons type="right" size="16" color="#c0c4cc" />
      </view>
    </view>

    <view v-if="!adminOnly" class="card row between" @tap="go('/pages/stats/index')">
      <text>统计报表</text>
      <uni-icons type="right" size="16" color="#c0c4cc" />
    </view>
  </view>
</template>

<style scoped>
.hello {
  padding: 8rpx 8rpx 24rpx;
}

.hello-title {
  font-size: 38rpx;
  font-weight: 700;
}

.kpis {
  display: flex;
  margin-bottom: 24rpx;
}

.kpi {
  flex: 1;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx 16rpx;
  margin-right: 16rpx;
  min-height: 88rpx;
  text-align: center;
}

.kpi:last-child {
  margin-right: 0;
}

.kpi-value {
  font-size: 44rpx;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.kpi-money {
  font-size: 30rpx;
  line-height: 66rpx;
  word-break: break-all;
}

.kpi-label {
  font-size: 24rpx;
  color: #646a73;
}

.status-grid {
  display: flex;
}

.status-cell {
  flex: 1;
  text-align: center;
  padding: 12rpx 0;
  min-height: 88rpx;
}

.status-count {
  font-size: 40rpx;
  font-weight: 700;
}

.quick {
  display: flex;
  flex-wrap: wrap;
}

.quick-item {
  width: 33.33%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16rpx 8rpx;
  box-sizing: border-box;
}

.quick-icon {
  width: 88rpx;
  height: 88rpx;
  border-radius: 20rpx;
  background: #e8efff;
  color: #2f6bff;
  font-size: 36rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8rpx;
}

.quick-name {
  max-width: 100%;
  font-size: 26rpx;
}

.notice {
  display: flex;
  align-items: center;
  min-height: 96rpx;
  border-bottom: 1rpx solid #f0f1f2;
}

.notice:last-child {
  border-bottom: none;
}

.dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #e5484d;
  margin-right: 12rpx;
  flex-shrink: 0;
}
</style>
