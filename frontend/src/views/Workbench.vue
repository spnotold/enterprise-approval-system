<script setup lang="ts">
// 工作台：问候直接落在桌面上；左栏待你审批（或我的申请最近 5 条）、发起申请、管理入口，右栏我的申请小账单、最近通知。
// 每张单据独立加载、独立失败
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { api } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { APP_STATUS_LABEL, APP_TYPE_LABEL, APP_TYPE_PATH, ROLE_LABEL } from '@/lib/labels'
import { fmtDateTime, todayShanghai } from '@/lib/datetime'
import { useAuthStore } from '@/stores/auth'
import { noticeTarget, useNoticeStore } from '@/stores/notice'
import MoneyText from '@/components/MoneyText.vue'
import StatusTag from '@/components/StatusTag.vue'
import { ago, dateLine, shortDesc } from '@/components/workbench/format'
import type {
  ApplicationSummary,
  AppStatus,
  AppType,
  NotificationItem,
  PageResponse,
  PersonalStats,
  TaskItem,
  TemplateOption,
} from '@/lib/types'

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

function typeLabel(r: { type: AppType; templateName: string }): string {
  return r.type === 'CUSTOM' ? r.templateName : APP_TYPE_LABEL[r.type]
}

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
const todayText = computed(() => dateLine(todayShanghai()))
const roles = computed(() =>
  (auth.me?.roles ?? []).map((r) => ({
    code: r.code,
    text: `${ROLE_LABEL[r.code] ?? r.name}${r.primaryHandler ? '（主办人）' : ''}`,
  })),
)

// ---------- 待你审批（前 5 条） ----------

const pending = useCard<PageResponse<TaskItem>>(() => api.tasks.pending({ page: 1, size: 5 }))
const pendingIsEmpty = computed(() => pending.data.value?.total === 0)

function taskTarget(t: TaskItem) {
  return { path: `/applications/${t.applicationId}`, query: t.status === 'PENDING' ? { from: 'pending' } : undefined }
}

// ---------- 我的申请：没有审批权限时左栏列最近 5 条 ----------

const mineRecent = useCard<PageResponse<ApplicationSummary>>(() =>
  api.applications.list({ scope: 'mine', page: 1, size: 5 }),
)

function appTarget(a: ApplicationSummary): RouteLocationRaw {
  return a.status === 'DRAFT' ? `/applications/${a.id}/edit` : `/applications/${a.id}`
}

// ---------- 我的申请：小账单 ----------

const LEDGER_ORDER: AppStatus[] = ['IN_APPROVAL', 'APPROVED', 'REJECTED', 'DRAFT', 'WITHDRAWN']
const LEDGER_TONE: Record<AppStatus, string> = {
  IN_APPROVAL: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  DRAFT: 'muted',
  WITHDRAWN: 'muted',
}
const personal = useCard<PersonalStats>(() => api.stats.personal())
const hasApplications = computed(() =>
  Object.values(personal.data.value?.statusCounts ?? {}).some((n) => (n ?? 0) > 0),
)

// ---------- 发起申请：最多 5 张空白单据 ----------

const LAUNCHER_MAX = 5
const templates = useCard<TemplateOption[]>(() => api.templates.available())
const launchers = computed(() => (templates.data.value ?? []).slice(0, LAUNCHER_MAX))

function templatePath(t: TemplateOption): string {
  if (t.category === 'BUILTIN' && t.bizType !== 'CUSTOM') return `/apply/${APP_TYPE_PATH[t.bizType]}`
  return `/apply/custom/${t.id}`
}

// ---------- 最近通知 ----------

const recentLoading = ref(false)
const recentError = ref<string | null>(null)
const recent = computed(() => notice.recent.slice(0, 5))

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

/** 10-17 09:41 */
function noticeTime(n: NotificationItem): string {
  return fmtDateTime(n.createdAt).slice(5)
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
    void mineRecent.load()
  }
  if (isAdmin.value && auth.can('ADMIN_USER')) void pendingRegs.load()
  void loadRecent()
})
</script>

<template>
  <div class="page workbench">
    <!-- 问候：直接落在桌面上 -->
    <header class="greet">
      <div class="greet-main">
        <h1 class="page-title greet-title">{{ greeting }}，{{ me?.realName }}</h1>
        <p class="greet-date">{{ todayText }}</p>
      </div>
      <p class="greet-who">
        <span>{{ me?.deptName ?? '未分配部门' }}</span>
        <span v-for="r in roles" :key="r.code">{{ r.text }}</span>
      </p>
    </header>

    <div class="wb">
      <div class="wb-col">
        <!-- 没有待办或没有审批权限：我的申请最近 5 条作为左栏主单据 -->
        <section v-if="canCreate && (!canTask || pendingIsEmpty)" class="sheet wb-primary" aria-labelledby="wb-mine-recent">
          <div class="sheet-head">
            <h2 id="wb-mine-recent">最近申请</h2>
          </div>
          <div v-if="mineRecent.loading.value && !mineRecent.data.value" class="wb-pad">
            <el-skeleton :rows="3" animated />
          </div>
          <div v-else-if="mineRecent.error.value" class="wb-pad wb-error">
            <span>{{ mineRecent.error.value }}</span>
            <el-button link type="primary" @click="mineRecent.load()">重试</el-button>
          </div>
          <p v-else-if="!mineRecent.data.value?.records.length" class="wb-pad wb-empty">还没有申请</p>
          <ul v-else class="rows">
            <li v-for="a in mineRecent.data.value.records" :key="a.id">
              <router-link :to="appTarget(a)" class="row app-row">
                <span class="two-line row-main">
                  <span class="cell-main">{{ a.title || a.appNo }}</span>
                  <span class="cell-sub row-meta">
                    <span>{{ typeLabel(a) }}</span>
                    <span>{{ a.appNo }}</span>
                    <MoneyText v-if="a.amountCents !== null" :cents="a.amountCents" />
                  </span>
                </span>
                <StatusTag class="row-status" :status="a.status" :show-node="false" />
                <span class="row-time">{{ ago(a.updatedAt) }}</span>
              </router-link>
            </li>
          </ul>
          <div class="sheet-foot">
            <router-link to="/applications/mine" class="wb-link">查看全部申请</router-link>
          </div>
        </section>

        <!-- 待你审批 -->
        <section v-if="canTask && !pendingIsEmpty" class="sheet wb-primary" aria-labelledby="wb-pending">
          <div class="sheet-head">
            <h2 id="wb-pending">
              待你审批<span v-if="pending.data.value" class="head-count">{{ pending.data.value.total }}</span>
            </h2>
          </div>
          <div v-if="pending.loading.value && !pending.data.value" class="wb-pad">
            <el-skeleton :rows="3" animated />
          </div>
          <div v-else-if="pending.error.value" class="wb-pad wb-error">
            <span>{{ pending.error.value }}</span>
            <el-button link type="primary" @click="pending.load()">重试</el-button>
          </div>
          <p v-else-if="!pending.data.value?.records.length" class="wb-pad wb-empty">暂无待处理的审批</p>
          <ul v-else class="rows">
            <li v-for="t in pending.data.value.records" :key="t.taskId">
              <router-link :to="taskTarget(t)" class="row task-row">
                <span class="two-line row-main">
                  <span class="cell-main">
                    {{ t.title || t.appNo }}<span v-if="t.overdue" class="tag-overdue">已超时</span>
                  </span>
                  <span class="cell-sub row-meta">
                    <span>{{ typeLabel(t) }}</span>
                    <span>{{ t.appNo }}</span>
                    <MoneyText v-if="t.amountCents !== null" :cents="t.amountCents" />
                  </span>
                </span>
                <span class="row-who">{{ t.applicant.realName }}</span>
                <span class="row-time">{{ ago(t.createdAt) }}</span>
                <span class="row-go" aria-hidden="true">处理</span>
              </router-link>
            </li>
          </ul>
          <div class="sheet-foot">
            <router-link to="/tasks/pending" class="wb-link">查看全部待办</router-link>
          </div>
        </section>

        <section v-if="canTask && pendingIsEmpty" class="sheet pending-quiet wb-primary" aria-label="待你审批">
          <p>没有待你审批的申请</p>
        </section>

        <!-- 发起申请：空白单据 -->
        <section v-if="canCreate" class="sheet wb-launch" aria-labelledby="wb-apply">
          <div class="sheet-head">
            <h2 id="wb-apply">发起申请</h2>
            <router-link v-if="(templates.data.value?.length ?? 0) > LAUNCHER_MAX" to="/apply" class="wb-link">
              全部申请类型
            </router-link>
          </div>
          <div v-if="templates.loading.value && !templates.data.value" class="wb-pad">
            <el-skeleton :rows="2" animated />
          </div>
          <div v-else-if="templates.error.value" class="wb-pad wb-error">
            <span>{{ templates.error.value }}</span>
            <el-button link type="primary" @click="templates.load()">重试</el-button>
          </div>
          <p v-else-if="!launchers.length" class="wb-pad wb-empty">暂无可发起的申请类型</p>
          <ul v-else class="blanks">
            <li v-for="t in launchers" :key="t.id">
              <router-link :to="templatePath(t)" class="blank">
                <span class="blank-name">{{ t.name }}</span>
                <span class="blank-lines" aria-hidden="true">
                  <i />
                  <i v-if="t.category === 'BUILTIN'" />
                  <i class="short" />
                </span>
                <span v-if="shortDesc(t)" class="blank-desc">{{ shortDesc(t) }}</span>
              </router-link>
            </li>
          </ul>
        </section>

        <!-- 管理入口 -->
        <template v-if="isAdmin">
          <section v-if="auth.can('ADMIN_USER')" class="sheet wb-admin-card" aria-labelledby="wb-regs">
            <div class="sheet-head">
              <h2 id="wb-regs">
                待审核注册<span v-if="pendingRegs.data.value !== null" class="head-count">{{ pendingRegs.data.value }}</span>
              </h2>
              <router-link to="/admin/registrations" class="wb-link">注册审核</router-link>
            </div>
            <div v-if="pendingRegs.loading.value && pendingRegs.data.value === null" class="wb-pad">
              <el-skeleton :rows="1" animated />
            </div>
            <div v-else-if="pendingRegs.error.value" class="wb-pad wb-error">
              <span>{{ pendingRegs.error.value }}</span>
              <el-button link type="primary" @click="pendingRegs.load()">重试</el-button>
            </div>
            <p v-else class="wb-pad wb-empty">
              {{ (pendingRegs.data.value ?? 0) > 0 ? '有新用户等待审核，请分配部门并确认' : '暂无待审核的注册' }}
            </p>
          </section>
          <section v-if="shortcuts.length" class="sheet wb-admin-card" aria-labelledby="wb-admin">
            <div class="sheet-head">
              <h2 id="wb-admin">管理入口</h2>
            </div>
            <ul class="rows">
              <li v-for="s in shortcuts" :key="s.path">
                <router-link :to="s.path" class="row admin-row">
                  <span class="two-line">
                    <span class="cell-main">{{ s.title }}</span>
                    <span class="cell-sub">{{ s.desc }}</span>
                  </span>
                </router-link>
              </li>
            </ul>
          </section>
        </template>
      </div>

      <div class="wb-col">
        <!-- 我的申请：小账单 -->
        <section v-if="canCreate" class="sheet wb-ledger" aria-labelledby="wb-mine">
          <div class="sheet-head">
            <h2 id="wb-mine">我的申请</h2>
            <router-link to="/applications/mine" class="wb-link">全部</router-link>
          </div>
          <div v-if="personal.loading.value && !personal.data.value" class="wb-pad">
            <el-skeleton :rows="3" animated />
          </div>
          <div v-else-if="personal.error.value" class="wb-pad wb-error">
            <span>{{ personal.error.value }}</span>
            <el-button link type="primary" @click="personal.load()">重试</el-button>
          </div>
          <template v-else-if="personal.data.value">
            <ul v-if="hasApplications" class="ledger">
              <li v-for="s in LEDGER_ORDER" :key="s">
                <router-link :to="{ path: '/applications/mine', query: { status: s } }" class="ledger-line">
                  <span class="status-dot" :class="`status-dot--${LEDGER_TONE[s]}`">{{ APP_STATUS_LABEL[s] }}</span>
                  <span class="ledger-count">{{ personal.data.value.statusCounts[s] ?? 0 }}</span>
                </router-link>
              </li>
            </ul>
            <div v-else class="ledger-empty">
              <p>还没有提交过申请</p>
              <el-button type="primary" @click="router.push('/apply')">填写申请</el-button>
            </div>
            <div v-if="hasApplications" class="ledger-total">
              <div class="ledger-total-label">
                <span>已通过金额</span>
                <span>共 {{ personal.data.value.approvedCount }} 单</span>
              </div>
              <MoneyText class="ledger-total-amount" :cents="personal.data.value.approvedAmountCents" />
            </div>
          </template>
        </section>

        <!-- 最近通知 -->
        <section class="sheet wb-notice" aria-labelledby="wb-notice">
          <div class="sheet-head">
            <h2 id="wb-notice">
              最近通知<span v-if="notice.unread > 0" class="head-sub">{{ notice.unread }} 条未读</span>
            </h2>
            <router-link to="/notifications" class="wb-link">通知中心</router-link>
          </div>
          <div v-if="recentLoading && !notice.recentLoaded" class="wb-pad">
            <el-skeleton :rows="3" animated />
          </div>
          <div v-else-if="recentError && !notice.recent.length" class="wb-pad wb-error">
            <span>{{ recentError }}</span>
            <el-button link type="primary" @click="loadRecent">重试</el-button>
          </div>
          <p v-else-if="!recent.length" class="wb-pad wb-empty">暂无通知</p>
          <ul v-else class="rows notices">
            <li v-for="n in recent" :key="n.id">
              <button type="button" class="row notice-row" :class="{ unread: !n.read }" @click="openNotice(n)">
                <span class="notice-dot" aria-hidden="true" />
                <span class="notice-title">
                  <span v-if="!n.read" class="visually-hidden">未读</span>{{ n.title }}
                </span>
                <span class="notice-time">{{ noticeTime(n) }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- 问候 ---------- */
.greet {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px 24px;
  margin-bottom: 4px;
}
.greet-main {
  min-width: 0;
}
.greet-date {
  margin: 4px 0 0;
  color: var(--eas-ink-2);
}
.greet-who {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  color: var(--eas-ink-2);
}

/* ---------- 两栏：左自适应，右 360 ---------- */
.wb {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  align-items: start;
  gap: var(--eas-gap);
}
.wb-col {
  display: grid;
  gap: var(--eas-gap);
  min-width: 0;
}

/* ---------- 单据通用 ---------- */
.sheet-head > h2 {
  display: flex;
  align-items: baseline;
}
/* 单据头下面直接是带上边线的行 / 无线的区块时，单据头本身不画线 */
.sheet-head {
  border-bottom: 0;
}
.head-count {
  margin-left: 6px;
  font-size: var(--eas-fs-14);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--eas-primary);
}
.head-sub {
  margin-left: 8px;
  font-size: var(--eas-fs-12);
  font-weight: 400;
  color: var(--eas-ink-3);
}
.wb-link {
  flex: none;
  color: var(--eas-primary);
  text-decoration: none;
  border-radius: var(--eas-radius-tag);
}
.wb-link:hover {
  text-decoration: underline;
}
.wb-link:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.wb-pad {
  margin: 0;
  padding: 4px var(--eas-sheet-inset) 20px;
}
.wb-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--eas-danger);
}
.wb-empty {
  color: var(--eas-ink-2);
}
.pending-quiet p {
  margin: 0;
  padding: 14px var(--eas-sheet-inset);
  color: var(--eas-ink-2);
}
.sheet-foot {
  padding: 12px var(--eas-sheet-inset) 16px;
  border-top: 1px solid var(--eas-rule);
}

/* ---------- 行（待办、我的申请、管理入口、通知）：整行可点，悬停浅底 + 左侧 3px 竖线 ---------- */
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: grid;
  align-items: center;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
  padding: 14px var(--eas-sheet-inset);
  border: 0;
  border-top: 1px solid var(--eas-rule);
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
  background: var(--eas-row-hover);
  box-shadow: inset 3px 0 0 var(--eas-primary);
}
.row:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: -2px;
}
.row:active {
  background: var(--eas-tab);
}
.row-main {
  min-width: 0;
}
.row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 1em;
}
.row-who {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-time {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--eas-ink-2);
}

/* 待办行：标题两行 / 申请人 / 时间 / 处理 */
.task-row {
  grid-template-columns: minmax(0, 1fr) 72px 92px 56px;
}
.row-go {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--eas-radius-control);
  background: var(--eas-primary);
  font-size: var(--eas-fs-note);
  color: var(--eas-sheet);
  white-space: nowrap;
  visibility: hidden;
}
.row:hover .row-go,
.row:focus-visible .row-go,
.row:focus-within .row-go {
  visibility: visible;
}
.row:hover .row-go {
  background: var(--eas-primary-hover);
}

/* 我的申请（最近 5 条）：标题两行 / 状态 / 时间 */
.app-row {
  grid-template-columns: minmax(0, 1fr) auto 92px;
}
.app-row .row-time {
  text-align: right;
}

/* 管理入口 */
.admin-row {
  grid-template-columns: minmax(0, 1fr);
}

/* ---------- 发起申请：空白单据 ---------- */
.blanks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 16px;
  margin: 0;
  padding: 4px var(--eas-sheet-inset) var(--eas-sheet-inset);
  list-style: none;
}
.blanks li {
  display: flex;
}
.blank {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding: 14px 14px 12px;
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  background: var(--eas-sheet);
  text-decoration: none;
  color: var(--eas-ink);
  transition:
    border-color var(--eas-dur-fast) var(--eas-ease),
    transform var(--eas-dur-fast) var(--eas-ease);
}
.blank:hover {
  border-color: var(--eas-primary);
}
.blank:focus-visible {
  border-color: var(--eas-primary);
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.blank:active {
  transform: translateY(1px);
}
.blank-name {
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-16);
  font-weight: 600;
  line-height: 1.4;
}
.blank-lines {
  display: grid;
  gap: 7px;
  margin: 12px 0 10px;
}
.blank-lines i {
  display: block;
  height: 1px;
  background: var(--eas-rule);
}
.blank-lines i.short {
  width: 60%;
}
.blank-desc {
  font-size: var(--eas-fs-12);
  line-height: 1.5;
  color: var(--eas-ink-3);
  white-space: nowrap;
}

/* ---------- 我的申请：小账单 ---------- */
.ledger {
  margin: 0;
  padding: 4px var(--eas-sheet-inset) 8px;
  list-style: none;
}
.ledger li + li {
  border-top: 1px solid var(--eas-rule);
}
.ledger-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 -8px;
  padding: 9px 8px;
  border-radius: var(--eas-radius-control);
  text-decoration: none;
  color: var(--eas-ink);
  transition: background var(--eas-dur-fast) var(--eas-ease);
}
.ledger-line:hover {
  background: var(--eas-row-hover);
}
.ledger-line:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: -2px;
}
.ledger-count {
  font-size: var(--eas-fs-16);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ledger-total {
  padding: 14px var(--eas-sheet-inset) 18px;
  border-top: 1px solid var(--eas-rule);
}
.ledger-total-label {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: var(--eas-fs-12);
  color: var(--eas-ink-3);
}
.ledger-total-amount {
  display: block;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-26);
  font-weight: 600;
  line-height: 1.35;
}
.ledger-empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px var(--eas-sheet-inset) 20px;
}
.ledger-empty p {
  margin: 0;
  color: var(--eas-ink-2);
}

/* ---------- 最近通知 ---------- */
.notice-row {
  grid-template-columns: 6px minmax(0, 1fr);
  grid-template-areas:
    'dot title'
    '. time';
  gap: 0 8px;
  padding-top: 10px;
  padding-bottom: 10px;
  font-size: var(--eas-fs-note);
  color: var(--eas-ink-2);
}
.notice-row.unread {
  color: var(--eas-ink);
}
.notice-dot {
  grid-area: dot;
  align-self: start;
  /* 与标题第一行居中：(13px × 1.65 − 6px) / 2 */
  margin-top: calc((var(--eas-fs-note) * 1.65 - 6px) / 2);
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.notice-row.unread .notice-dot {
  background: var(--eas-primary);
}
.notice-title {
  grid-area: title;
  min-width: 0;
  overflow-wrap: anywhere;
}
.notice-time {
  grid-area: time;
  font-size: var(--eas-fs-12);
  font-variant-numeric: tabular-nums;
  color: var(--eas-ink-3);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ---------- 响应式 ---------- */
@media (max-width: 1100px) {
  .wb {
    grid-template-columns: minmax(0, 1fr);
  }
  .wb-col {
    display: contents;
  }
  .wb-primary { order: 1; }
  .wb-ledger { order: 2; }
  .wb-launch { order: 3; }
  .wb-admin-card { order: 4; }
  .wb-notice { order: 5; }
}
@media (max-width: 768px) {
  .workbench .sheet {
    --eas-sheet-inset: 16px;
  }
  .greet {
    align-items: flex-start;
    flex-direction: column;
  }
  .task-row {
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      'main main main'
      'who time go';
    gap: 6px 12px;
  }
  .task-row .row-main {
    grid-area: main;
  }
  .task-row .row-who {
    grid-area: who;
  }
  .task-row .row-time {
    grid-area: time;
  }
  .task-row .row-go {
    grid-area: go;
    visibility: visible;
  }
  .row-who,
  .row-time {
    font-size: var(--eas-fs-12);
    color: var(--eas-ink-2);
  }
  .app-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'main main'
      'status time';
    gap: 6px 12px;
  }
  .app-row .row-main {
    grid-area: main;
  }
  .app-row .row-status {
    grid-area: status;
  }
  .app-row .row-time {
    grid-area: time;
  }
}
/* 触屏没有悬停：处理按钮常显（窄屏同样常显） */
@media (hover: none) {
  .row-go {
    visibility: visible;
  }
}
@media (prefers-reduced-motion: reduce) {
  .blank,
  .row,
  .ledger-line {
    transition: none;
  }
  .blank:active {
    transform: none;
  }
}
</style>
