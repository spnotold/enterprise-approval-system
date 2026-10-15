<script setup lang="ts">
// 工作台：按权限组合卡片（待办数、我的申请、快捷发起、最近通知、管理入口）；各卡片独立加载、独立失败
import { computed, onMounted, ref, shallowRef, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  Bell,
  EditPen,
  Files,
  List,
  Operation,
  User,
  UserFilled,
} from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { APP_TYPE_PATH, NOTIFICATION_TYPE_LABEL, ROLE_LABEL } from '@/lib/labels'
import { fromNow, todayShanghai } from '@/lib/datetime'
import { useAuthStore } from '@/stores/auth'
import { noticeTarget, useNoticeStore } from '@/stores/notice'
import MoneyText from '@/components/MoneyText.vue'
import StatusTag from '@/components/StatusTag.vue'
import type { AppStatus, NotificationItem, PersonalStats, TemplateOption } from '@/lib/types'

const auth = useAuthStore()
const notice = useNoticeStore()
const router = useRouter()

/** 卡片数据：各自的 loading / error，互不影响 */
function useCard<T>(fn: () => Promise<T>) {
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  async function load() {
    loading.value = true
    error.value = null
    try {
      data.value = await fn()
    } catch (e) {
      error.value = errorText(e, '加载失败')
    } finally {
      loading.value = false
    }
  }
  return { data, loading, error, load }
}

const me = computed(() => auth.me)
const canTask = computed(() => auth.can('TASK_HANDLE'))
const canCreate = computed(() => auth.can('APP_CREATE'))
const isAdmin = computed(
  () => !canCreate.value && (auth.me?.permissions ?? []).some((p) => p.startsWith('ADMIN_')),
)

// ---------- 问候 ----------

const greeting = computed(() => {
  const h = new Date(Date.now() + 8 * 3600_000).getUTCHours() // 上海时间
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})
const todayText = computed(() => {
  const d = todayShanghai()
  const [y, m, day] = d.split('-').map(Number)
  const week = '日一二三四五六'[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
  return `${y} 年 ${m} 月 ${day} 日 星期${week}`
})
const roles = computed(() =>
  (auth.me?.roles ?? []).map((r) => ({
    code: r.code,
    text: `${ROLE_LABEL[r.code] ?? r.name}${r.primaryHandler ? '（主办人）' : ''}`,
  })),
)

// ---------- 待办数 ----------

const pending = useCard(() => api.tasks.pendingCount())

// ---------- 我的申请 ----------

const STATUS_ORDER: AppStatus[] = ['DRAFT', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN']
const personal = useCard<PersonalStats>(() => api.stats.personal())

// ---------- 快捷发起 ----------

const templates = useCard<TemplateOption[]>(() => api.templates.available())

function templatePath(t: TemplateOption): string {
  if (t.category === 'BUILTIN' && t.bizType !== 'CUSTOM') return `/apply/${APP_TYPE_PATH[t.bizType]}`
  return `/apply/custom/${t.id}`
}
const TEMPLATE_TYPE: Record<string, 'primary' | 'success' | 'warning' | 'info'> = {
  PURCHASE: 'primary',
  TRAVEL: 'success',
  EXPENSE: 'warning',
  CUSTOM: 'info',
}

// ---------- 最近通知 ----------

const recentLoading = ref(false)
const recentError = ref<string | null>(null)
const recent = computed(() => notice.recent.slice(0, 6))

async function loadRecent() {
  recentLoading.value = true
  recentError.value = null
  try {
    await notice.fetchRecent()
  } catch (e) {
    recentError.value = errorText(e, '加载失败')
  } finally {
    recentLoading.value = false
  }
}

async function openNotice(n: NotificationItem) {
  if (!n.read) await notice.markRead(n.id).catch(() => undefined)
  const target = noticeTarget(n)
  if (target) await router.push(target)
}

// ---------- 管理端 ----------

interface Shortcut {
  path: string
  title: string
  desc: string
  icon: Component
  perm: string
}
const ADMIN_SHORTCUTS: Shortcut[] = [
  { path: '/admin/registrations', title: '注册审核', desc: '审核新用户并分配部门', icon: UserFilled, perm: 'ADMIN_USER' },
  { path: '/admin/users', title: '用户管理', desc: '角色、停用、重置密码', icon: User, perm: 'ADMIN_USER' },
  { path: '/admin/templates', title: '流程模板', desc: '表单与审批节点配置', icon: Files, perm: 'ADMIN_TEMPLATE' },
  { path: '/admin/tasks', title: '待办监控', desc: '超时与停用人员待办转办', icon: Operation, perm: 'ADMIN_TRANSFER' },
  { path: '/admin/audit-logs', title: '审计日志', desc: '管理变更留痕', icon: List, perm: 'ADMIN_AUDIT' },
]
const shortcuts = computed(() => ADMIN_SHORTCUTS.filter((s) => auth.can(s.perm)))
const pendingRegs = useCard(async () => {
  const page = await api.admin.users.list({ status: 'PENDING', page: 1, size: 1 })
  return page.total
})

onMounted(() => {
  if (canTask.value) void pending.load()
  if (canCreate.value) {
    void personal.load()
    void templates.load()
  }
  if (isAdmin.value && auth.can('ADMIN_USER')) void pendingRegs.load()
  void loadRecent()
})
</script>

<template>
  <div class="page workbench">
    <!-- 问候 -->
    <el-card shadow="never" class="hello">
      <div class="hello-row">
        <el-avatar :size="52" class="hello-avatar">{{ me?.realName?.slice(-2) }}</el-avatar>
        <div class="hello-main">
          <h2 class="hello-title">{{ greeting }}，{{ me?.realName }}</h2>
          <div class="hello-meta">
            <span class="muted">{{ me?.deptName ?? '未分配部门' }}</span>
            <el-tag v-for="r in roles" :key="r.code" size="small" effect="plain" disable-transitions>
              {{ r.text }}
            </el-tag>
          </div>
        </div>
        <div class="muted small hello-date">{{ todayText }}</div>
      </div>
    </el-card>

    <el-row :gutter="16" class="cards">
      <!-- 待办数 -->
      <el-col v-if="canTask" :xs="24" :sm="12" :lg="8">
        <el-card shadow="hover" class="card stat-card clickable" @click="router.push('/tasks/pending')">
          <div class="stat-head">
            <el-icon class="stat-icon primary"><EditPen /></el-icon>
            <span>我的待办</span>
          </div>
          <el-skeleton v-if="pending.loading.value && !pending.data.value" :rows="1" animated />
          <div v-else-if="pending.error.value" class="card-error">
            <span>{{ pending.error.value }}</span>
            <el-button link type="primary" @click.stop="pending.load()">重试</el-button>
          </div>
          <template v-else>
            <div class="big-number">{{ pending.data.value?.count ?? 0 }}</div>
            <div class="muted small link-line">
              {{ (pending.data.value?.count ?? 0) > 0 ? '有待处理的审批，去处理' : '暂无待处理的审批' }}
              <el-icon><ArrowRight /></el-icon>
            </div>
          </template>
        </el-card>
      </el-col>

      <!-- 我的申请 -->
      <el-col v-if="canCreate" :xs="24" :sm="canTask ? 12 : 24" :lg="canTask ? 16 : 24">
        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-header">
              <span>我的申请</span>
              <router-link to="/applications/mine" class="more">全部 <el-icon><ArrowRight /></el-icon></router-link>
            </div>
          </template>
          <el-skeleton v-if="personal.loading.value && !personal.data.value" :rows="2" animated />
          <div v-else-if="personal.error.value" class="card-error">
            <span>{{ personal.error.value }}</span>
            <el-button link type="primary" @click="personal.load()">重试</el-button>
          </div>
          <template v-else-if="personal.data.value">
            <div class="status-grid">
              <router-link
                v-for="s in STATUS_ORDER"
                :key="s"
                :to="{ path: '/applications/mine', query: { status: s } }"
                class="status-cell"
              >
                <span class="status-count">{{ personal.data.value.statusCounts[s] ?? 0 }}</span>
                <StatusTag :status="s" :show-node="false" size="small" />
              </router-link>
            </div>
            <div class="approved-line">
              <span class="muted">已通过金额</span>
              <MoneyText :cents="personal.data.value.approvedAmountCents" strong class="approved-amount" />
              <span class="muted small">（共 {{ personal.data.value.approvedCount }} 单）</span>
            </div>
          </template>
        </el-card>
      </el-col>

      <!-- 快捷发起 -->
      <el-col v-if="canCreate" :xs="24">
        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-header">
              <span>快捷发起</span>
              <router-link to="/apply" class="more">全部模板 <el-icon><ArrowRight /></el-icon></router-link>
            </div>
          </template>
          <el-skeleton v-if="templates.loading.value && !templates.data.value" :rows="1" animated />
          <div v-else-if="templates.error.value" class="card-error">
            <span>{{ templates.error.value }}</span>
            <el-button link type="primary" @click="templates.load()">重试</el-button>
          </div>
          <el-empty v-else-if="!templates.data.value?.length" :image-size="60" description="暂无可发起的申请类型" />
          <div v-else class="quick-grid">
            <router-link v-for="t in templates.data.value" :key="t.id" :to="templatePath(t)" class="quick-item">
              <el-tag :type="TEMPLATE_TYPE[t.bizType] ?? 'info'" size="small" disable-transitions>
                {{ t.category === 'BUILTIN' ? '内置' : '自定义' }}
              </el-tag>
              <span class="quick-name">{{ t.name }}</span>
              <span v-if="t.description" class="muted small quick-desc">{{ t.description }}</span>
            </router-link>
          </div>
        </el-card>
      </el-col>

      <!-- 管理入口 -->
      <template v-if="isAdmin">
        <el-col v-if="auth.can('ADMIN_USER')" :xs="24" :sm="12" :lg="8">
          <el-card shadow="hover" class="card stat-card clickable" @click="router.push('/admin/registrations')">
            <div class="stat-head">
              <el-icon class="stat-icon warning"><UserFilled /></el-icon>
              <span>待审核注册</span>
            </div>
            <el-skeleton v-if="pendingRegs.loading.value && pendingRegs.data.value === null" :rows="1" animated />
            <div v-else-if="pendingRegs.error.value" class="card-error">
              <span>{{ pendingRegs.error.value }}</span>
              <el-button link type="primary" @click.stop="pendingRegs.load()">重试</el-button>
            </div>
            <template v-else>
              <div class="big-number">{{ pendingRegs.data.value ?? 0 }}</div>
              <div class="muted small link-line">
                {{ (pendingRegs.data.value ?? 0) > 0 ? '有新用户等待审核，去处理' : '暂无待审核的注册' }}
                <el-icon><ArrowRight /></el-icon>
              </div>
            </template>
          </el-card>
        </el-col>
        <el-col v-if="shortcuts.length" :xs="24" :sm="auth.can('ADMIN_USER') ? 12 : 24" :lg="auth.can('ADMIN_USER') ? 16 : 24">
          <el-card shadow="never" class="card">
            <template #header>
              <div class="card-header"><span>管理入口</span></div>
            </template>
            <div class="shortcut-grid">
              <router-link v-for="s in shortcuts" :key="s.path" :to="s.path" class="shortcut">
                <el-icon :size="22" class="shortcut-icon"><component :is="s.icon" /></el-icon>
                <span class="shortcut-text">
                  <span class="shortcut-title">{{ s.title }}</span>
                  <span class="muted small">{{ s.desc }}</span>
                </span>
              </router-link>
            </div>
          </el-card>
        </el-col>
      </template>

      <!-- 最近通知 -->
      <el-col :xs="24">
        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-header">
              <span class="with-icon"><el-icon><Bell /></el-icon>最近通知</span>
              <router-link to="/notifications" class="more">
                通知中心<template v-if="notice.unread > 0">（{{ notice.unread }} 条未读）</template>
                <el-icon><ArrowRight /></el-icon>
              </router-link>
            </div>
          </template>
          <el-skeleton v-if="recentLoading && !notice.recentLoaded" :rows="3" animated />
          <div v-else-if="recentError && !notice.recent.length" class="card-error">
            <span>{{ recentError }}</span>
            <el-button link type="primary" @click="loadRecent">重试</el-button>
          </div>
          <el-empty v-else-if="!recent.length" :image-size="60" description="暂无通知" />
          <ul v-else class="notice-list">
            <li v-for="n in recent" :key="n.id">
              <button type="button" class="notice-item" :class="{ unread: !n.read }" @click="openNotice(n)">
                <el-tag size="small" :type="n.type === 'APP_REJECTED' ? 'danger' : 'info'" disable-transitions>
                  {{ NOTIFICATION_TYPE_LABEL[n.type] ?? n.type }}
                </el-tag>
                <span class="notice-title">{{ n.title }}</span>
                <span class="muted small nowrap">{{ fromNow(n.createdAt) }}</span>
              </button>
            </li>
          </ul>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.hello-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.hello-avatar {
  background: var(--el-color-primary);
  font-size: 18px;
  flex-shrink: 0;
}
.hello-main {
  flex: 1;
  min-width: 200px;
}
.hello-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
}
.hello-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.hello-date {
  white-space: nowrap;
}
.cards {
  row-gap: 16px;
}
.card {
  height: 100%;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
}
.with-icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  font-weight: normal;
  color: var(--el-color-primary);
  text-decoration: none;
}
.clickable {
  cursor: pointer;
}
.stat-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 8px;
}
.stat-icon {
  font-size: 20px;
  padding: 6px;
  border-radius: 8px;
}
.stat-icon.primary {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.stat-icon.warning {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}
.big-number {
  font-size: 36px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.link-line {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
}
.card-error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--el-color-danger);
  font-size: 13px;
  padding: 8px 0;
}
.status-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.status-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s;
}
.status-cell:hover,
.status-cell:focus-visible {
  background: var(--el-fill-color-light);
  outline: none;
}
.status-count {
  font-size: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.approved-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.approved-amount {
  font-size: 18px;
  color: var(--el-color-success);
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.quick-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.quick-item:hover,
.quick-item:focus-visible {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  outline: none;
}
.quick-name {
  font-weight: 600;
}
.quick-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.shortcut {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
}
.shortcut:hover,
.shortcut:focus-visible {
  border-color: var(--el-color-primary);
  outline: none;
}
.shortcut-icon {
  color: var(--el-color-primary);
}
.shortcut-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.shortcut-title {
  font-weight: 600;
}
.notice-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.notice-list li + li {
  border-top: 1px solid var(--el-border-color-extra-light);
}
.notice-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 4px;
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  color: var(--el-text-color-regular);
  cursor: pointer;
}
.notice-item:hover,
.notice-item:focus-visible {
  background: var(--el-fill-color-light);
  outline: none;
}
.notice-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice-item.unread .notice-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
@media (max-width: 768px) {
  .status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .hello-date {
    width: 100%;
  }
}
</style>
