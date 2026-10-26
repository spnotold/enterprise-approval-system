<script setup lang="ts">
// 工作台：待办数、我的申请状态、最近通知、发起申请
import { computed, reactive, ref, toRefs } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import type { NotificationItem, TemplateOption } from '@/lib/types'
import AdminNotice from '@/components/AdminNotice.vue'
import { auth, requireLogin } from '@/stores/auth'
import { notice } from '@/stores/notice'
import { applyIllustrationUrl } from '@/utils/applyIllustration'
import { APP_STATUS_LABEL, APP_STATUS_ORDER, APP_TYPE_LABEL } from '@/utils/labels'
import { go, goAppList, goForm, goTaskHandle, openLink } from '@/utils/nav'
import { formatCents } from '@/lib/money'
import { fmtShort } from '@/utils/time'
import {
  createInitialHomeState,
  loadAllSections,
  loadNoticesSection,
  loadPendingSection,
  loadStatsSection,
  loadTemplatesSection,
  type HomeApis,
} from './homeData'

const ready = ref(false)
const state = reactive(createInitialHomeState())
const {
  stats,
  statsError,
  notices,
  noticesError,
  templates,
  templatesError,
  pending,
  pendingError,
} = toRefs(state)

const me = computed(() => auth.state.me)
const adminOnly = computed(() => auth.isAdminOnly)
const canHandle = computed(() => auth.can('TASK_HANDLE'))
const canCreate = computed(() => auth.can('APP_CREATE'))

const greeting = computed(() => {
  const h = (new Date().getUTCHours() + 8) % 24
  return h < 6 ? '夜深了' : h < 12 ? '上午好' : h < 18 ? '下午好' : '晚上好'
})

const pendingCount = computed(() => stats.value?.pendingTaskCount ?? state.pendingTotal ?? 0)

const statusCounts = computed(() => stats.value?.statusCounts ?? null)
const totalStatusCount = computed(() => {
  if (!statusCounts.value) return 0
  return APP_STATUS_ORDER.reduce((sum, s) => sum + (statusCounts.value?.[s] ?? 0), 0)
})

const statusSegments = computed(() => {
  const counts = statusCounts.value
  if (!counts || totalStatusCount.value === 0) return []
  return APP_STATUS_ORDER.map((status) => ({
    status,
    count: counts[status] ?? 0,
  })).filter((s) => s.count > 0)
})

const apis: HomeApis = {
  fetchStats: () => api.stats.personal(),
  fetchNotices: () => api.notifications.list({ page: 1, size: 5 }),
  fetchTemplates: () => api.templates.available(),
  fetchPending: () => api.tasks.pending({ page: 1, size: 3 }),
}

const permissions = computed(() => ({
  adminOnly: adminOnly.value,
  canCreate: canCreate.value,
  canHandle: canHandle.value,
}))

// onLoad 与 onShow 首次进入会同时触发：进行中的加载复用同一个 Promise，避免重复请求
let inflight: Promise<void> | null = null
function loadAll(): Promise<void> {
  if (!inflight) {
    inflight = loadAllSections(apis, state, permissions.value).finally(() => {
      inflight = null
    })
  }
  return inflight
}

function retryPending(): void {
  void loadPendingSection(apis, state, permissions.value)
}

function retryStats(): void {
  void loadStatsSection(apis, state, permissions.value)
}

function retryTemplates(): void {
  void loadTemplatesSection(apis, state, permissions.value)
}

function retryNotices(): void {
  void loadNoticesSection(apis, state)
}

onLoad(async () => {
  if (!(await requireLogin())) return
  ready.value = true
  await loadAll()
})

onShow(() => {
  notice.applyBadge()
  if (ready.value) void loadAll()
})

onPullDownRefresh(async () => {
  try {
    await loadAll()
  } finally {
    uni.stopPullDownRefresh()
  }
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
    <!-- 顶部横幅插画 -->
    <view class="home-banner">
      <image
        class="home-banner-bg"
        src="/static/illustrations/m-home-banner.jpg"
        mode="scaleToFill"
      />
      <view class="home-banner-content">
        <view class="home-banner-greeting display ellipsis">{{ greeting }}，{{ me?.realName ?? '' }}</view>
        <view class="home-banner-sub">
          <text v-if="me?.deptName">{{ me.deptName }}</text>
          <text v-if="me?.deptName && canHandle && pendingCount > 0" class="home-banner-sep">　</text>
          <text v-if="canHandle && pendingCount > 0">
            有 <text class="home-banner-num display">{{ pendingCount }}</text> 张单子等你审批
          </text>
        </view>
      </view>
    </view>

    <AdminNotice v-if="adminOnly" />

    <template v-else-if="ready">
      <!-- 待你审批 -->
      <view v-if="canHandle" class="card">
        <view class="card-title">
          <view class="card-title-left">
            <view class="ink-glyph ink-glyph--sun" />
            <text>待你审批</text>
            <text v-if="pendingCount > 0" class="pending-pill display inked">{{ pendingCount }}</text>
          </view>
        </view>

        <view v-if="pendingError" class="section-error">
          <text class="section-error-text">{{ pendingError }}</text>
          <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="retryPending">重试</view>
        </view>

        <template v-else>
          <view v-if="!pending.length" class="empty-hint muted">暂无待办</view>
          <view
            v-for="t in pending.slice(0, 3)"
            :key="t.taskId"
            class="task-row"
            hover-class="is-pressed"
            hover-stay-time="60"
            @tap="goTaskHandle(t.taskId, t.applicationId)"
          >
            <view class="task-info flex1">
              <view class="task-row-top">
                <text class="tag">{{ APP_TYPE_LABEL[t.type] }}</text>
                <text class="task-title ellipsis">{{ t.title || t.templateName }}</text>
              </view>
              <view class="task-meta">
                <text>{{ t.applicant.realName }}</text>
                <text class="task-meta-space">　</text>
                <text>{{ fmtShort(t.createdAt) }}</text>
                <text v-if="t.amountCents !== null" class="task-amount amount">¥{{ formatCents(t.amountCents) }}</text>
              </view>
            </view>
            <view class="task-action-btn inked">处理</view>
          </view>
          <view class="link-btn pending-all-btn" hover-class="is-pressed" hover-stay-time="60" @tap="go('/pages/task/list')">
            查看全部待办
          </view>
        </template>
      </view>

      <!-- 我的申请 -->
      <view class="card">
        <view class="card-title">
          <text>我的申请</text>
          <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="goAppList()">查看全部申请</view>
        </view>

        <view v-if="statsError" class="section-error">
          <text class="section-error-text">{{ statsError }}</text>
          <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="retryStats">重试</view>
        </view>

        <view v-else>
          <!-- 状态比例条 -->
          <view class="status-bar" aria-hidden="true">
            <template v-if="totalStatusCount > 0">
              <view
                v-for="seg in statusSegments"
                :key="seg.status"
                class="status-bar-seg"
                :class="[`status-seg--${seg.status.toLowerCase()}`, { inked: seg.status !== 'DRAFT' }]"
                :style="{ flexGrow: seg.count }"
              />
            </template>
            <view v-else class="status-bar-empty" />
          </view>

          <!-- 5 个计数 -->
          <view class="status-grid">
            <view
              v-for="s in APP_STATUS_ORDER"
              :key="s"
              class="status-cell"
              hover-class="is-pressed"
              hover-stay-time="60"
              @tap="goAppList({ status: s })"
            >
              <view class="status-num display">{{ stats?.statusCounts?.[s] ?? 0 }}</view>
              <view class="status-label">{{ APP_STATUS_LABEL[s] }}</view>
            </view>
          </view>
        </view>
      </view>

      <!-- 发起申请 -->
      <view v-if="canCreate" class="card">
        <view class="card-title">
          <text>发起申请</text>
          <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="go('/pages/apply/index')">全部类型</view>
        </view>

        <view v-if="templatesError" class="section-error">
          <text class="section-error-text">{{ templatesError }}</text>
          <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="retryTemplates">重试</view>
        </view>

        <view v-else-if="!templates.length" class="empty-hint muted">暂无可发起的模板</view>

        <view v-else class="home-apply-grid">
          <view
            v-for="t in templates.slice(0, 4)"
            :key="t.id"
            class="home-apply-card"
            hover-class="is-pressed"
            hover-stay-time="60"
            @tap="startTemplate(t)"
          >
            <view class="home-apply-pic">
              <image class="home-apply-img" :src="applyIllustrationUrl(t)" mode="aspectFill" />
            </view>
            <view class="home-apply-name display">{{ t.name }}</view>
          </view>
        </view>
      </view>
    </template>

    <!-- 最近通知 -->
    <view class="card">
      <view class="card-title">
        <text>最近通知</text>
        <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="go('/pages/notice/list')">查看全部通知</view>
      </view>

      <view v-if="noticesError" class="section-error">
        <text class="section-error-text">{{ noticesError }}</text>
        <view class="link-btn" hover-class="is-pressed" hover-stay-time="60" @tap="retryNotices">重试</view>
      </view>

      <template v-else>
        <view v-if="!notices.length" class="empty-hint muted">暂无通知</view>
        <view
          v-for="n in notices"
          :key="n.id"
          class="notice-row"
          hover-class="is-pressed"
          hover-stay-time="60"
          @tap="tapNotice(n)"
        >
          <view v-if="!n.read" class="notice-dot" />
          <view class="notice-content flex1">
            <view class="notice-title ellipsis" :class="{ 'is-unread': !n.read, 'is-read': n.read }">
              {{ n.title }}
            </view>
            <view class="notice-time">{{ fmtShort(n.createdAt) }}</view>
          </view>
        </view>
      </template>
    </view>

    <!-- 统计报表 -->
    <view
      v-if="!adminOnly"
      class="card stats-card"
      hover-class="is-pressed"
      hover-stay-time="60"
      @tap="go('/pages/stats/index')"
    >
      <view class="stats-title display">统计报表</view>
      <view class="stats-action">查看报表</view>
    </view>
  </view>
</template>

<style scoped>
/* 顶部横幅插画 */
.home-banner {
  position: relative;
  height: 380rpx;
  border-radius: 32rpx;
  box-shadow: var(--eas-shadow-sheet);
  margin: 0 8rpx 32rpx 0;
  overflow: hidden;
  background-color: var(--eas-sheet);
}

/* 按原图比例（900×488）定宽高、贴右放，横幅比图窄时裁掉左边的天空，行人始终在右侧 */
.home-banner-bg {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  width: 701rpx;
  min-width: 100%;
  display: block;
}

/* 文字只占左上的天空：限宽、单行省略，长姓名不会把副行挤到山上 */
.home-banner-content {
  position: relative;
  z-index: 1;
  max-width: 62%;
  padding: 38rpx 0 0 36rpx;
  display: flex;
  flex-direction: column;
}

.home-banner-greeting {
  font-size: 52rpx;
  line-height: 1.25;
  color: var(--eas-ink);
  margin-bottom: 12rpx;
}

.home-banner-sub {
  font-size: 26rpx;
  color: var(--eas-ink-2);
  line-height: 1.4;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  max-height: 2.8em;
  overflow: hidden;
}

.home-banner-num {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--eas-ink);
  margin: 0 4rpx;
  line-height: 1;
}

/* 待办 */
.card-title-left {
  display: flex;
  align-items: center;
}

.pending-pill {
  height: 40rpx;
  min-width: 40rpx;
  padding: 0 16rpx;
  border-radius: var(--eas-radius-pill);
  background-color: var(--eas-mustard);
  color: var(--eas-ink);
  font-size: 24rpx;
  font-weight: 700;
  line-height: 40rpx;
  margin-left: 14rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.task-row {
  display: flex;
  align-items: center;
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--eas-rule);
  min-height: 112rpx;
}

.task-row:last-of-type {
  border-bottom: none;
}

.task-info {
  min-width: 0;
}

.task-row-top {
  display: flex;
  align-items: center;
  min-width: 0;
}

.task-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--eas-ink);
  flex: 1;
  min-width: 0;
}

.task-amount {
  margin-left: auto;
  padding-left: 16rpx;
  font-size: 28rpx;
  color: var(--eas-ink);
}

.task-meta {
  font-size: 24rpx;
  color: var(--eas-ink-3);
  margin-top: 8rpx;
  display: flex;
  align-items: center;
}

.task-action-btn {
  flex-shrink: 0;
  height: 52rpx;
  line-height: 52rpx;
  padding: 0 24rpx;
  border-radius: var(--eas-radius-pill);
  background-color: var(--eas-mustard);
  color: var(--eas-ink);
  font-size: 26rpx;
  font-weight: 600;
  box-shadow: 4rpx 4rpx 0 var(--eas-mustard-deep);
  margin-left: 20rpx;
}

.pending-all-btn {
  width: 100%;
  margin-top: 12rpx;
}

/* 错误与空提示 */
.section-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  min-height: 88rpx;
}

.section-error-text {
  color: var(--eas-danger);
  font-size: 26rpx;
  flex: 1;
  margin-right: 16rpx;
}

.empty-hint {
  padding: 24rpx 0;
  text-align: center;
}

/* 我的申请状态条与网格 */
.status-bar {
  display: flex;
  height: 20rpx;
  border-radius: var(--eas-radius-pill);
  overflow: hidden;
  margin: 16rpx 0 24rpx;
  background-color: var(--eas-tab);
  gap: 2rpx;
}

.status-bar-seg {
  display: block;
  flex-basis: 0;
  min-width: 0;
  height: 100%;
}

.status-bar-empty {
  width: 100%;
  height: 100%;
  background-color: var(--eas-tab);
}

.status-seg--draft {
  background-color: var(--eas-tab);
}

.status-seg--in_approval {
  background-color: var(--eas-sky);
}

.status-seg--approved {
  background-color: var(--eas-sage);
}

.status-seg--rejected {
  background-color: var(--eas-rust);
}

.status-seg--withdrawn {
  background-color: var(--eas-muted);
}

.status-grid {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12rpx 0;
  min-height: 88rpx;
  border-radius: var(--eas-radius-control);
}

.status-num {
  font-size: 44rpx;
  font-weight: 700;
  color: var(--eas-ink);
  line-height: 1.2;
}

.status-label {
  font-size: 24rpx;
  color: var(--eas-ink-3);
  margin-top: 6rpx;
}

/* 发起申请卡片网格 */
.home-apply-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24rpx;
  row-gap: 20rpx;
  padding-top: 10rpx;
}

.home-apply-card {
  display: flex;
  flex-direction: column;
  padding: 8rpx 0;
  min-height: 88rpx;
  border-radius: var(--eas-radius-control);
}

.home-apply-card.is-pressed {
  background-color: transparent !important;
}

.home-apply-pic {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 6rpx 6rpx 0 var(--eas-shade);
  background-color: var(--eas-tab);
  margin-bottom: 14rpx;
  transition: transform var(--eas-dur-fast) var(--eas-ease), box-shadow var(--eas-dur-fast) var(--eas-ease);
}

.home-apply-img {
  width: 100%;
  height: 100%;
  display: block;
}

.home-apply-name {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--eas-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-apply-card.is-pressed .home-apply-pic {
  transform: translate(4rpx, 4rpx);
  box-shadow: 2rpx 2rpx 0 var(--eas-shade);
}

/* 最近通知 */
.notice-row {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--eas-rule);
  min-height: 104rpx;
}

.notice-row:last-child {
  border-bottom: none;
}

.notice-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background-color: var(--eas-rust);
  margin-right: 16rpx;
  flex-shrink: 0;
}

.notice-content {
  min-width: 0;
}

.notice-title {
  font-size: 28rpx;
  line-height: 1.4;
}

.notice-title.is-unread {
  font-weight: 600;
  color: var(--eas-ink);
}

.notice-title.is-read {
  font-weight: 400;
  color: var(--eas-ink-2);
}

.notice-time {
  font-size: 24rpx;
  color: var(--eas-ink-3);
  margin-top: 6rpx;
}

/* 统计报表单据 */
.stats-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 104rpx;
  padding: 28rpx 32rpx;
}

.stats-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--eas-ink);
}

.stats-action {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--eas-link);
}
</style>
