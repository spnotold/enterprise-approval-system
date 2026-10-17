<script setup lang="ts">
// 工作台：一张面板分节（待你审批、我的申请、发起申请、管理入口、最近通知）；各节独立加载、独立失败
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { APP_TYPE_LABEL, APP_TYPE_PATH, NOTIFICATION_TYPE_LABEL, ROLE_LABEL } from '@/lib/labels'
import { fromNow, todayShanghai } from '@/lib/datetime'
import { useAuthStore } from '@/stores/auth'
import { noticeTarget, useNoticeStore } from '@/stores/notice'
import MoneyText from '@/components/MoneyText.vue'
import StatusTag from '@/components/StatusTag.vue'
import type { AppStatus, NotificationItem, PageResponse, PersonalStats, TaskItem, TemplateOption } from '@/lib/types'

const auth = useAuthStore()
const notice = useNoticeStore()
const router = useRouter()

/** 分节数据：各自的 loading / error，互不影响 */
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

// ---------- 待你审批（前 5 条） ----------

const pending = useCard<PageResponse<TaskItem>>(() => api.tasks.pending({ page: 1, size: 5 }))

function taskTarget(t: TaskItem) {
  return { path: `/applications/${t.applicationId}`, query: t.status === 'PENDING' ? { from: 'pending' } : undefined }
}
function taskType(t: TaskItem): string {
  return t.type === 'CUSTOM' ? t.templateName : APP_TYPE_LABEL[t.type]
}

// ---------- 我的申请 ----------

const STATUS_ORDER: AppStatus[] = ['DRAFT', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN']
const personal = useCard<PersonalStats>(() => api.stats.personal())

// ---------- 发起申请 ----------

const templates = useCard<TemplateOption[]>(() => api.templates.available())

function templatePath(t: TemplateOption): string {
  if (t.category === 'BUILTIN' && t.bizType !== 'CUSTOM') return `/apply/${APP_TYPE_PATH[t.bizType]}`
  return `/apply/custom/${t.id}`
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
  perm: string
}
const ADMIN_SHORTCUTS: Shortcut[] = [
  { path: '/admin/registrations', title: '注册审核', desc: '审核新用户并分配部门', perm: 'ADMIN_USER' },
  { path: '/admin/users', title: '用户管理', desc: '角色、停用、重置密码', perm: 'ADMIN_USER' },
  { path: '/admin/templates', title: '流程模板', desc: '表单与审批节点配置', perm: 'ADMIN_TEMPLATE' },
  { path: '/admin/tasks', title: '待办监控', desc: '超时与停用人员待办转办', perm: 'ADMIN_TRANSFER' },
  { path: '/admin/audit-logs', title: '审计日志', desc: '管理变更留痕', perm: 'ADMIN_AUDIT' },
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
    <div class="sheet">
      <!-- 问候 -->
      <header class="part hello">
        <div>
          <h2 class="hello-title">{{ greeting }}，{{ me?.realName }}</h2>
          <div class="hello-date">{{ todayText }}</div>
        </div>
        <div class="hello-meta">
          <span>{{ me?.deptName ?? '未分配部门' }}</span>
          <span v-for="r in roles" :key="r.code">{{ r.text }}</span>
        </div>
      </header>

      <!-- 待你审批 -->
      <section v-if="canTask" class="part" aria-labelledby="wb-pending">
        <div class="part-head">
          <h3 id="wb-pending" class="section-title part-title">
            待你审批<span v-if="pending.data.value" class="part-count">{{ pending.data.value.total }}</span>
          </h3>
          <router-link to="/tasks/pending" class="part-link">查看全部待办</router-link>
        </div>
        <el-skeleton v-if="pending.loading.value && !pending.data.value" :rows="2" animated />
        <div v-else-if="pending.error.value" class="part-error">
          <span>{{ pending.error.value }}</span>
          <el-button link type="primary" @click="pending.load()">重试</el-button>
        </div>
        <p v-else-if="!pending.data.value?.records.length" class="part-empty">暂无待处理的审批</p>
        <ul v-else class="row-list">
          <li v-for="t in pending.data.value.records" :key="t.taskId">
            <router-link :to="taskTarget(t)" class="row task-row">
              <span class="task-type">
                <i class="dot" :class="{ overdue: t.overdue }" aria-hidden="true" />{{ taskType(t) }}
              </span>
              <span class="task-title">
                <span class="ellipsis">{{ t.title || t.appNo }}</span>
                <span v-if="t.overdue" class="overdue-text">已超时</span>
              </span>
              <span class="task-who">{{ t.applicant.realName }}</span>
              <span class="task-time">{{ fromNow(t.createdAt) }}</span>
              <MoneyText class="task-amount" :cents="t.amountCents" />
              <span class="row-go" aria-hidden="true">处理</span>
            </router-link>
          </li>
        </ul>
      </section>

      <!-- 我的申请 -->
      <section v-if="canCreate" class="part" aria-labelledby="wb-mine">
        <div class="part-head">
          <h3 id="wb-mine" class="section-title part-title">我的申请</h3>
          <router-link to="/applications/mine" class="part-link">查看全部申请</router-link>
        </div>
        <el-skeleton v-if="personal.loading.value && !personal.data.value" :rows="1" animated />
        <div v-else-if="personal.error.value" class="part-error">
          <span>{{ personal.error.value }}</span>
          <el-button link type="primary" @click="personal.load()">重试</el-button>
        </div>
        <div v-else-if="personal.data.value" class="strip-row">
          <div class="status-strip">
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
          <div class="approved">
            <span class="approved-label">已通过金额</span>
            <MoneyText :cents="personal.data.value.approvedAmountCents" strong class="approved-amount" />
            <span class="approved-count">共 {{ personal.data.value.approvedCount }} 单</span>
          </div>
        </div>
      </section>

      <!-- 发起申请 -->
      <section v-if="canCreate" class="part" aria-labelledby="wb-apply">
        <div class="part-head">
          <h3 id="wb-apply" class="section-title part-title">发起申请</h3>
          <router-link to="/apply" class="part-link">查看全部模板</router-link>
        </div>
        <el-skeleton v-if="templates.loading.value && !templates.data.value" :rows="1" animated />
        <div v-else-if="templates.error.value" class="part-error">
          <span>{{ templates.error.value }}</span>
          <el-button link type="primary" @click="templates.load()">重试</el-button>
        </div>
        <p v-else-if="!templates.data.value?.length" class="part-empty">暂无可发起的申请类型</p>
        <ul v-else class="entry-grid">
          <li v-for="t in templates.data.value" :key="t.id" class="entry-slot">
            <router-link :to="templatePath(t)" class="entry">
              <span class="entry-name">{{ t.name }}</span>
              <span v-if="t.description" class="entry-desc">{{ t.description }}</span>
            </router-link>
          </li>
        </ul>
      </section>

      <!-- 管理入口 -->
      <template v-if="isAdmin">
        <section v-if="auth.can('ADMIN_USER')" class="part" aria-labelledby="wb-regs">
          <div class="part-head">
            <h3 id="wb-regs" class="section-title part-title">
              待审核注册<span v-if="pendingRegs.data.value !== null" class="part-count">{{ pendingRegs.data.value }}</span>
            </h3>
            <router-link to="/admin/registrations" class="part-link">打开注册审核</router-link>
          </div>
          <el-skeleton v-if="pendingRegs.loading.value && pendingRegs.data.value === null" :rows="1" animated />
          <div v-else-if="pendingRegs.error.value" class="part-error">
            <span>{{ pendingRegs.error.value }}</span>
            <el-button link type="primary" @click="pendingRegs.load()">重试</el-button>
          </div>
          <p v-else class="part-empty">
            {{ (pendingRegs.data.value ?? 0) > 0 ? '有新用户等待审核，请分配部门并确认' : '暂无待审核的注册' }}
          </p>
        </section>
        <section v-if="shortcuts.length" class="part" aria-labelledby="wb-admin">
          <div class="part-head">
            <h3 id="wb-admin" class="section-title part-title">管理入口</h3>
          </div>
          <ul class="entry-grid">
            <li v-for="s in shortcuts" :key="s.path" class="entry-slot">
              <router-link :to="s.path" class="entry">
                <span class="entry-name">{{ s.title }}</span>
                <span class="entry-desc">{{ s.desc }}</span>
              </router-link>
            </li>
          </ul>
        </section>
      </template>

      <!-- 最近通知 -->
      <section class="part" aria-labelledby="wb-notice">
        <div class="part-head">
          <h3 id="wb-notice" class="section-title part-title">
            最近通知<span v-if="notice.unread > 0" class="part-sub">{{ notice.unread }} 条未读</span>
          </h3>
          <router-link to="/notifications" class="part-link">打开通知中心</router-link>
        </div>
        <el-skeleton v-if="recentLoading && !notice.recentLoaded" :rows="3" animated />
        <div v-else-if="recentError && !notice.recent.length" class="part-error">
          <span>{{ recentError }}</span>
          <el-button link type="primary" @click="loadRecent">重试</el-button>
        </div>
        <p v-else-if="!recent.length" class="part-empty">暂无通知</p>
        <ul v-else class="row-list">
          <li v-for="n in recent" :key="n.id">
            <button type="button" class="row notice-row" @click="openNotice(n)">
              <span class="unread-dot" :class="{ on: !n.read }" :title="n.read ? undefined : '未读'" />
              <span class="notice-type">{{ NOTIFICATION_TYPE_LABEL[n.type] ?? n.type }}</span>
              <span class="notice-title">{{ n.title }}</span>
              <span class="notice-time">{{ fromNow(n.createdAt) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.workbench {
  max-width: 1200px;
}
.sheet {
  background: var(--eas-surface);
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
}
.part {
  padding: 20px 24px;
}
.part + .part {
  border-top: 1px solid var(--eas-rule);
}

/* 问候 */
.hello {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 24px;
  padding-top: 24px;
}
.hello-title {
  margin: 0;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-xl);
  font-weight: 600;
  line-height: 1.3;
}
.hello-date {
  margin-top: 2px;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}
.hello-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  color: var(--eas-ink-2);
}

/* 分节标题 */
.part-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.part-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
}
.part-count {
  font-variant-numeric: tabular-nums;
  color: var(--eas-primary);
}
.part-sub {
  font-size: var(--eas-fs-xs);
  font-weight: 400;
  color: var(--eas-ink-2);
}
.part-link {
  flex: none;
  color: var(--eas-primary);
  text-decoration: none;
}
.part-link:hover {
  text-decoration: underline;
}
.part-error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--eas-danger);
}
.part-empty {
  margin: 0;
  color: var(--eas-ink-2);
}

/* 列表行（待办、通知）：整行可点，悬停底色 + 左侧竖线 */
.row-list {
  list-style: none;
  margin: 0 -24px;
  padding: 0;
}
.row-list li + li {
  border-top: 1px solid var(--eas-paper-deep);
}
.row {
  display: grid;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 11px 24px 11px 21px;
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  font: inherit;
  text-align: left;
  text-decoration: none;
  color: var(--eas-ink);
  cursor: pointer;
  transition: background var(--eas-dur-fast) var(--eas-ease);
}
.row:hover,
.row:focus-visible {
  background: var(--eas-paper);
  border-left-color: var(--eas-primary);
}
.row:focus-visible {
  outline-offset: -2px;
}
.row:active {
  background: var(--eas-paper-deep);
}
.ellipsis {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  display: inline-block;
  flex: none;
  width: 6px;
  height: 6px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--eas-primary);
}
.dot.overdue {
  background: var(--eas-warning);
}

/* 待办行 */
.task-row {
  grid-template-columns: 112px minmax(0, 1fr) 72px 96px 112px 56px;
  grid-template-areas: 'type title who time amount go';
  column-gap: 12px;
}
.task-type {
  grid-area: type;
  display: flex;
  align-items: center;
  min-width: 0;
  white-space: nowrap;
}
.task-title {
  grid-area: title;
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.overdue-text {
  flex: none;
  font-size: var(--eas-fs-xs);
  color: var(--eas-warning-text);
}
.task-who {
  grid-area: who;
  white-space: nowrap;
}
.task-time {
  grid-area: time;
  white-space: nowrap;
  color: var(--eas-ink-2);
}
.task-amount {
  grid-area: amount;
  justify-self: end;
}
.row-go {
  grid-area: go;
  justify-self: end;
  padding: 1px 12px;
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  background: var(--eas-surface);
  color: var(--eas-primary);
  opacity: 0;
  transition: opacity var(--eas-dur-fast) var(--eas-ease);
}
.row:hover .row-go,
.row:focus-visible .row-go {
  opacity: 1;
}

/* 我的申请：状态条 */
.strip-row {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 16px 32px;
}
.status-strip {
  display: flex;
  flex: 1 1 440px;
  min-width: 0;
}
.status-cell {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  padding: 8px 16px;
  text-decoration: none;
  color: inherit;
  transition: background var(--eas-dur-fast) var(--eas-ease);
}
.status-cell:first-child {
  padding-left: 0;
}
.status-cell + .status-cell {
  border-left: 1px solid var(--eas-rule);
}
.status-cell:hover,
.status-cell:focus-visible {
  background: var(--eas-paper);
}
.status-cell:focus-visible {
  outline-offset: -2px;
}
.status-cell:active {
  background: var(--eas-paper-deep);
}
.status-count {
  font-size: var(--eas-fs-lg);
  font-weight: 600;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.approved {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  gap: 2px;
  margin-left: auto;
  padding-left: 32px;
  border-left: 1px solid var(--eas-rule);
}
.approved-label,
.approved-count {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}
.approved-amount {
  font-size: var(--eas-fs-lg);
  line-height: 1.3;
}

/* 入口小格（发起申请、管理入口）：固定占位，悬停时说明完整展开 */
.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.entry-slot {
  position: relative;
  height: 60px;
}
.entry {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-sizing: border-box;
  min-height: 100%;
  padding: 8px 12px;
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  background: var(--eas-surface);
  text-decoration: none;
  color: var(--eas-ink);
  transition: border-color var(--eas-dur-fast) var(--eas-ease);
}
.entry:hover,
.entry:focus-visible {
  z-index: 2;
  border-color: var(--eas-primary);
}
.entry:active {
  transform: translateY(1px);
}
.entry-name {
  font-weight: 500;
}
.entry-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--eas-fs-xs);
  line-height: 1.5;
  color: var(--eas-ink-2);
}
.entry:hover .entry-desc,
.entry:focus-visible .entry-desc {
  overflow: visible;
  white-space: normal;
}

/* 通知行 */
.notice-row {
  grid-template-columns: 6px 88px minmax(0, 1fr) auto;
  column-gap: 12px;
}
.unread-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
}
.unread-dot.on {
  background: var(--eas-primary);
}
.notice-type {
  color: var(--eas-ink-2);
  white-space: nowrap;
}
.notice-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice-time {
  white-space: nowrap;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

@media (max-width: 768px) {
  .part {
    padding: 16px;
  }
  .row-list {
    margin: 0 -16px;
  }
  .row {
    padding-right: 16px;
  }
  .task-row {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    grid-template-areas:
      'title title title amount'
      'type who time go';
    row-gap: 4px;
    column-gap: 12px;
  }
  .task-type {
    font-size: var(--eas-fs-xs);
    color: var(--eas-ink-2);
  }
  .task-who {
    font-size: var(--eas-fs-xs);
    color: var(--eas-ink-2);
  }
  .task-time {
    font-size: var(--eas-fs-xs);
  }
  .row-go {
    opacity: 1;
  }
  .status-strip {
    flex-wrap: wrap;
  }
  .status-cell {
    flex: 0 0 33.333%;
    box-sizing: border-box;
    padding: 8px 12px;
  }
  .status-cell:first-child {
    padding-left: 12px;
  }
  .status-cell:nth-child(3n + 1) {
    border-left: none;
  }
  .approved {
    align-items: flex-start;
    margin-left: 0;
    padding: 12px 0 0;
    border-left: none;
    border-top: 1px solid var(--eas-rule);
    width: 100%;
  }
  .entry-slot {
    height: auto;
  }
  .entry {
    position: static;
    min-height: 44px;
  }
  .entry-desc {
    white-space: normal;
  }
  .notice-row {
    grid-template-columns: 6px minmax(0, 1fr) auto;
    grid-template-areas:
      'dot title title'
      '. type time';
    row-gap: 2px;
  }
  .unread-dot {
    grid-area: dot;
  }
  .notice-title {
    grid-area: title;
  }
  .notice-type {
    grid-area: type;
    font-size: var(--eas-fs-xs);
  }
  .notice-time {
    grid-area: time;
  }
}

/* 触屏没有悬停：处理按钮常显，入口说明直接展开 */
@media (hover: none) {
  .row-go {
    opacity: 1;
  }
  .entry-slot {
    height: auto;
  }
  .entry {
    position: static;
    min-height: 44px;
  }
  .entry-desc {
    white-space: normal;
  }
}
</style>
