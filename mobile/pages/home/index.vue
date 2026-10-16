<script setup lang="ts">
// 工作台：待办数、我的申请状态、最近通知、发起申请
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import type { NotificationItem, PersonalStats, TaskItem, TemplateOption } from '@/lib/types'
import AdminNotice from '@/components/AdminNotice.vue'
import { auth, requireLogin } from '@/stores/auth'
import { notice } from '@/stores/notice'
import { showError } from '@/utils/feedback'
import { APP_STATUS_LABEL, APP_STATUS_ORDER, APP_TYPE_LABEL } from '@/utils/labels'
import { go, goAppList, goForm, goTaskHandle, openLink } from '@/utils/nav'
import { fmtShort } from '@/utils/time'

const ready = ref(false)
const stats = ref<PersonalStats | null>(null)
const notices = ref<NotificationItem[]>([])
const templates = ref<TemplateOption[]>([])
const loading = ref(false)
const pending = ref<TaskItem[]>([])

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
    const [s, n, t, p] = await Promise.all([
      api.stats.personal(),
      api.notifications.list({ page: 1, size: 5 }),
      canCreate.value ? api.templates.available() : Promise.resolve([] as TemplateOption[]),
      canHandle.value ? api.tasks.pending({ page: 1, size: 3 }) : Promise.resolve(null),
    ])
    stats.value = s
    notices.value = n.records
    templates.value = t
    pending.value = p?.records ?? []
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
      <view v-if="canHandle" class="card">
        <view class="card-title">待你审批 <text class="pending-count">{{ stats?.pendingTaskCount ?? 0 }}</text></view>
        <view v-if="!pending.length" class="muted">暂无待办</view>
        <view v-for="t in pending" :key="t.taskId" class="pending-row" hover-class="is-pressed" hover-stay-time="60" @tap="goTaskHandle(t.taskId, t.applicationId)">
          <view class="row between"><text class="tag tag-blue">{{ APP_TYPE_LABEL[t.type] }}</text><text class="muted">{{ fmtShort(t.createdAt) }}</text></view>
          <view class="bold ellipsis">{{ t.title || t.templateName }}</view>
          <view class="row between"><text class="muted">{{ t.applicant.realName }}</text><text class="text-primary">去处理</text></view>
        </view>
        <view class="link-btn section-link" hover-class="is-pressed" hover-stay-time="60" @tap="go('/pages/task/list')">查看全部待办</view>
      </view>

      <view class="card">
        <view class="card-title">
          我的申请
          <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="goAppList()">查看全部申请</view>
        </view>
        <view class="status-grid">
          <view v-for="s in APP_STATUS_ORDER" :key="s" class="status-cell" hover-class="is-pressed" hover-stay-time="60" @tap="goAppList({ status: s })">
            <view class="status-count" :class="`status-${s.toLowerCase()}`">{{ stats?.statusCounts?.[s] ?? 0 }}</view>
            <view class="muted">{{ APP_STATUS_LABEL[s] }}</view>
          </view>
        </view>
      </view>

      <view v-if="templates.length" class="card">
        <view class="card-title">
          发起申请
          <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="go('/pages/apply/index')">查看发起入口</view>
        </view>
        <view class="quick">
          <view v-for="t in templates.slice(0, 8)" :key="t.id" class="quick-item" hover-class="is-pressed" hover-stay-time="60" @tap="startTemplate(t)">
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
        <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="go('/pages/notice/list')">查看全部通知</view>
      </view>
      <view v-if="!notices.length" class="muted">暂无通知</view>
      <view v-for="n in notices" :key="n.id" class="notice" hover-class="is-pressed" hover-stay-time="60" @tap="tapNotice(n)">
        <view v-if="!n.read" class="dot" />
        <view class="flex1">
          <view class="ellipsis" :class="{ bold: !n.read }">{{ n.title }}</view>
          <view class="muted">{{ fmtShort(n.createdAt) }}</view>
        </view>
      </view>
    </view>

    <view v-if="!adminOnly" class="card row between" hover-class="is-pressed" hover-stay-time="60" @tap="go('/pages/stats/index')">
      <text>统计报表</text>
      <text class="text-primary">查看报表</text>
    </view>
  </view>
</template>

<style scoped>
.hello { padding: 8rpx 8rpx 32rpx; }
.hello-title { font-family: var(--eas-font-serif); font-size: var(--eas-fs-lg); font-weight: 600; margin-bottom: 8rpx; }
.pending-count { color: var(--eas-primary); font-variant-numeric: tabular-nums; margin-left: auto; }
.pending-row { padding: 20rpx 0; border-bottom: 1rpx solid var(--eas-rule); min-height: 88rpx; }
.pending-row .bold { margin: 10rpx 0; }
.section-link { display: flex; }
.status-grid { display: flex; }
.status-cell { flex: 1; text-align: center; padding: 12rpx 0; min-height: 88rpx; }
.status-count { font-size: var(--eas-fs-lg); font-weight: 600; color: var(--eas-ink-2); }
.status-in_approval { color: var(--eas-primary); }
.status-approved { color: var(--eas-success); }
.status-rejected { color: var(--eas-danger); }
.quick { display: flex; flex-wrap: wrap; }
.quick-item { width: 25%; display: flex; flex-direction: column; align-items: center; padding: 16rpx 8rpx; box-sizing: border-box; min-height: 88rpx; }
.quick-icon { width: 88rpx; height: 88rpx; border: 1rpx solid var(--eas-rule); border-radius: var(--eas-radius-control); background: var(--eas-paper); color: var(--eas-primary); font-size: var(--eas-fs-md); font-weight: 600; display: flex; align-items: center; justify-content: center; margin-bottom: 8rpx; }
.quick-name { max-width: 100%; font-size: var(--eas-fs-sm); }
.notice { display: flex; align-items: center; min-height: 112rpx; border-bottom: 1rpx solid var(--eas-rule); }
.notice:last-child { border-bottom: none; }
.dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: var(--eas-primary); margin-right: 12rpx; flex-shrink: 0; }
</style>
