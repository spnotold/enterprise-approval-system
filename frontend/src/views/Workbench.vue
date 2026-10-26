<script setup lang="ts">
// 工作台：套色横幅插画与问候在顶；左栏待你审批（或我的申请最近 5 条）、发起申请、管理入口；右栏我的申请账单、最近通知。
// 每张单据独立加载、独立失败
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { api } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { APP_STATUS_LABEL, APP_TYPE_LABEL, APP_TYPE_PATH, ROLE_LABEL } from '@/lib/labels'
import { todayShanghai } from '@/lib/datetime'
import { useAuthStore } from '@/stores/auth'
import { noticeTarget, useNoticeStore } from '@/stores/notice'
import ApplyEntryCard from '@/components/ApplyEntryCard.vue'
import MoneyText from '@/components/MoneyText.vue'
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

type LedgerTone = 'sky' | 'sage' | 'rust' | 'draft' | 'muted'
const LEDGER_ORDER: AppStatus[] = ['IN_APPROVAL', 'APPROVED', 'REJECTED', 'DRAFT', 'WITHDRAWN']
const STATUS_TAG_TYPE: Record<AppStatus, 'primary' | 'success' | 'danger' | 'info'> = {
  IN_APPROVAL: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  DRAFT: 'info',
  WITHDRAWN: 'info',
}
const LEDGER_TONE: Record<AppStatus, LedgerTone> = {
  IN_APPROVAL: 'sky',
  APPROVED: 'sage',
  REJECTED: 'rust',
  DRAFT: 'draft',
  WITHDRAWN: 'muted',
}
const personal = useCard<PersonalStats>(() => api.stats.personal())
const hasApplications = computed(() =>
  Object.values(personal.data.value?.statusCounts ?? {}).some((n) => (n ?? 0) > 0),
)
const ledgerRows = computed(() => {
  const counts = personal.data.value?.statusCounts
  if (!counts) return []
  return LEDGER_ORDER.map((status) => ({
    status,
    label: APP_STATUS_LABEL[status],
    count: counts[status] ?? 0,
    tone: LEDGER_TONE[status],
    inked: status !== 'DRAFT',
  }))
})
const ledgerSegments = computed(() => ledgerRows.value.filter((r) => r.count > 0))

// ---------- 发起申请：最多 5 张入口卡 ----------

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
    <!-- 横幅：问候、日期与待审数量压在左侧空白天空上 -->
    <header class="banner">
      <div class="banner-body">
        <h1 class="banner-title">{{ greeting }}，{{ me?.realName }}</h1>
        <p class="banner-line">
          <span>{{ todayText }}</span>
          <span v-if="canTask && pending.data.value">
            <template v-if="pending.data.value.total > 0">
              有 <b class="banner-num">{{ pending.data.value.total }}</b> 张单子等你审批
            </template>
            <template v-else>暂无待你审批的单子</template>
          </span>
        </p>
        <p class="banner-meta">
          <span>{{ me?.deptName ?? '未分配部门' }}</span>
          <span v-for="r in roles" :key="r.code">{{ r.text }}</span>
        </p>
      </div>
    </header>

    <div class="wb">
      <div class="wb-col">
        <!-- 没有待办或没有审批权限：我的申请最近 5 条作为左栏主单据 -->
        <section v-if="canCreate && (!canTask || pendingIsEmpty)" class="sheet wb-primary" aria-labelledby="wb-mine-recent">
          <div class="sheet-head">
            <h2 id="wb-mine-recent">
              <i class="ink-glyph ink-glyph--stack" aria-hidden="true" />最近申请
            </h2>
            <router-link to="/applications/mine">查看全部申请</router-link>
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
                  <span class="cell-sub">{{ typeLabel(a) }}{{ '\u3000' }}{{ a.appNo }}</span>
                </span>
                <el-tag class="row-status" :type="STATUS_TAG_TYPE[a.status]" size="small">
                  {{ APP_STATUS_LABEL[a.status] }}
                </el-tag>
                <span class="two-line row-amount-col">
                  <MoneyText v-if="a.amountCents !== null" class="row-amount" :cents="a.amountCents" />
                  <span v-else class="cell-none row-amount-none">无</span>
                  <span class="cell-sub">{{ ago(a.updatedAt) }}</span>
                </span>
              </router-link>
            </li>
          </ul>
        </section>

        <!-- 待你审批 -->
        <section v-if="canTask && !pendingIsEmpty" class="sheet wb-primary" aria-labelledby="wb-pending">
          <div class="sheet-head">
            <h2 id="wb-pending">
              <i class="ink-glyph ink-glyph--sun" aria-hidden="true" />待你审批
            </h2>
            <router-link to="/tasks/pending">查看全部待办</router-link>
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
                  <span class="cell-sub">{{ typeLabel(t) }}{{ '\u3000' }}{{ t.appNo }}</span>
                </span>
                <span class="two-line row-who">
                  <span class="row-who-name">{{ t.applicant.realName }}</span>
                  <span v-if="t.deptName ?? t.applicant.deptName" class="cell-sub">{{ t.deptName ?? t.applicant.deptName }}</span>
                </span>
                <span class="two-line row-amount-col">
                  <MoneyText v-if="t.amountCents !== null" class="row-amount" :cents="t.amountCents" />
                  <span v-else class="cell-none row-amount-none">无</span>
                  <span class="cell-sub">{{ ago(t.createdAt) }}</span>
                </span>
                <span class="row-go inked" aria-hidden="true">处理</span>
              </router-link>
            </li>
          </ul>
        </section>

        <section v-if="canTask && pendingIsEmpty" class="sheet pending-quiet wb-primary" aria-label="待你审批">
          <div class="sheet-head">
            <h2><i class="ink-glyph ink-glyph--sun" aria-hidden="true" />待你审批</h2>
            <router-link to="/tasks/pending">查看全部待办</router-link>
          </div>
          <p class="wb-pad wb-empty">没有待你审批的申请</p>
        </section>

        <!-- 发起申请 -->
        <section v-if="canCreate" class="sheet wb-launch" aria-labelledby="wb-apply">
          <div class="sheet-head">
            <h2 id="wb-apply">
              <i class="ink-glyph ink-glyph--leaf" aria-hidden="true" />发起申请
            </h2>
            <router-link to="/apply">全部类型</router-link>
          </div>
          <div v-if="templates.loading.value && !templates.data.value" class="wb-pad">
            <el-skeleton :rows="2" animated />
          </div>
          <div v-else-if="templates.error.value" class="wb-pad wb-error">
            <span>{{ templates.error.value }}</span>
            <el-button link type="primary" @click="templates.load()">重试</el-button>
          </div>
          <p v-else-if="!launchers.length" class="wb-pad wb-empty">暂无可发起的申请类型</p>
          <ul v-else class="starts">
            <li v-for="t in launchers" :key="t.id">
              <ApplyEntryCard :template="t" :to="templatePath(t)" :description="shortDesc(t)" />
            </li>
          </ul>
        </section>

        <!-- 管理入口 -->
        <template v-if="isAdmin">
          <section v-if="auth.can('ADMIN_USER')" class="sheet wb-admin-card" aria-labelledby="wb-regs">
            <div class="sheet-head">
              <h2 id="wb-regs">
                <i class="ink-glyph ink-glyph--sun" aria-hidden="true" />待审核注册<span
                  v-if="pendingRegs.data.value !== null"
                  class="head-count"
                >{{ pendingRegs.data.value }}</span>
              </h2>
              <router-link to="/admin/registrations">注册审核</router-link>
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
              <h2 id="wb-admin">
                <i class="ink-glyph ink-glyph--stack" aria-hidden="true" />管理入口
              </h2>
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
            <h2 id="wb-mine">
              <i class="ink-glyph ink-glyph--hill" aria-hidden="true" />我的申请
            </h2>
            <router-link to="/applications/mine">全部</router-link>
          </div>
          <div v-if="personal.loading.value && !personal.data.value" class="wb-pad">
            <el-skeleton :rows="3" animated />
          </div>
          <div v-else-if="personal.error.value" class="wb-pad wb-error">
            <span>{{ personal.error.value }}</span>
            <el-button link type="primary" @click="personal.load()">重试</el-button>
          </div>
          <template v-else-if="personal.data.value">
            <div v-if="hasApplications" class="ledger-wrap">
              <div class="ledger-bar" aria-hidden="true">
                <i
                  v-for="seg in ledgerSegments"
                  :key="seg.status"
                  class="ledger-seg"
                  :class="[`ledger-swatch--${seg.tone}`, { inked: seg.inked }]"
                  :style="{ flexGrow: seg.count }"
                />
              </div>
              <ul class="ledger">
                <li v-for="item in ledgerRows" :key="item.status">
                  <router-link :to="{ path: '/applications/mine', query: { status: item.status } }" class="ledger-line">
                    <span
                      class="ledger-swatch"
                      :class="[`ledger-swatch--${item.tone}`, { inked: item.inked }]"
                      aria-hidden="true"
                    />
                    <span class="ledger-label">{{ item.label }}</span>
                    <span class="ledger-count">{{ item.count }}</span>
                  </router-link>
                </li>
              </ul>
              <div class="ledger-total inked">
                <div class="ledger-total-label">
                  <span>已通过金额</span>
                  <span v-if="personal.data.value.approvedCount > 0">共 {{ personal.data.value.approvedCount }} 单</span>
                </div>
                <MoneyText class="ledger-total-amount" :cents="personal.data.value.approvedAmountCents" />
              </div>
            </div>
            <div v-else class="ledger-empty">
              <p>还没有提交过申请</p>
              <el-button type="primary" @click="router.push('/apply')">填写申请</el-button>
            </div>
          </template>
        </section>

        <!-- 最近通知 -->
        <section class="sheet wb-notice" aria-labelledby="wb-notice">
          <div class="sheet-head">
            <h2 id="wb-notice">
              <i class="ink-glyph ink-glyph--bell" aria-hidden="true" />最近通知<span
                v-if="notice.unread > 0"
                class="head-sub"
              >{{ notice.unread }} 条未读</span>
            </h2>
            <router-link to="/notifications">通知中心</router-link>
          </div>
          <div v-if="recentLoading && !notice.recentLoaded" class="wb-pad">
            <el-skeleton :rows="3" animated />
          </div>
          <div v-else-if="recentError && !notice.recent.length" class="wb-pad wb-error">
            <span>{{ recentError }}</span>
            <el-button link type="primary" @click="loadRecent">重试</el-button>
          </div>
          <p v-else-if="!recent.length" class="wb-pad wb-empty">暂无通知</p>
          <ul v-else class="notices">
            <li v-for="n in recent" :key="n.id">
              <button type="button" class="notice-row" :class="{ unread: !n.read }" @click="openNotice(n)">
                <span class="notice-dot" :class="{ inked: !n.read }" aria-hidden="true" />
                <span class="notice-title">
                  <span v-if="!n.read" class="visually-hidden">未读</span>{{ n.title }}
                </span>
                <span class="notice-time">{{ ago(n.createdAt) }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- 横幅 ---------- */
.banner {
  box-sizing: border-box;
  min-height: 236px;
  padding: 46px 48px 32px;
  border-radius: 20px;
  background: var(--eas-tab) url('@/assets/illustrations/workbench-banner.webp') right 28% / cover no-repeat;
  box-shadow: var(--eas-shadow-sheet);
}
.banner-body {
  max-width: 580px;
}
.banner-title {
  margin: 0;
  font-family: var(--eas-font-display);
  font-size: 50px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
}
.banner-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 16px;
  margin: 12px 0 0;
  font-size: var(--eas-fs-nav);
  color: var(--eas-ink-2);
}
.banner-num {
  font-family: var(--eas-font-display);
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--eas-ink);
}
.banner-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 8px 0 0;
  font-size: var(--eas-fs-note);
  color: var(--eas-ink-3);
}

/* ---------- 两栏：左自适应，右 340 ---------- */
.wb {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  align-items: start;
  gap: var(--eas-gap);
}
.wb-col {
  display: grid;
  gap: var(--eas-gap);
  min-width: 0;
}

/* ---------- 单据通用 ---------- */
.workbench .sheet-head {
  flex-wrap: wrap;
}
.workbench .sheet-head h2 {
  min-width: 0;
  flex-wrap: wrap;
}
.workbench .sheet-head a {
  display: inline-flex;
  align-items: center;
  flex: none;
  min-height: 32px;
}
.head-count {
  margin-left: 4px;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-16);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--eas-ink);
}
.head-sub {
  margin-left: 4px;
  font-family: var(--eas-font-sans);
  font-size: var(--eas-fs-12);
  font-weight: 400;
  letter-spacing: 0;
  color: var(--eas-ink-3);
}
.wb-pad {
  margin: 0;
  padding: 6px var(--eas-sheet-inset) 20px;
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

/* ---------- 登记簿式列表行（待你审批、最近申请、管理入口） ---------- */
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.rows li + li .row {
  border-top: 1px solid var(--eas-rule);
}
.rows li:last-child .row {
  border-radius: 0 0 var(--eas-radius-panel) var(--eas-radius-panel);
}
.row {
  display: grid;
  align-items: center;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
  padding: 13px var(--eas-sheet-inset);
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  text-decoration: none;
  color: var(--eas-ink);
  cursor: pointer;
  transition:
    background-color var(--eas-dur-fast) var(--eas-ease),
    box-shadow var(--eas-dur-fast) var(--eas-ease);
}
.row:hover,
.row:focus-visible {
  background: var(--eas-row-hover);
  box-shadow: inset 5px 0 0 var(--eas-mustard);
}
.row:focus-visible {
  outline: 2px solid var(--eas-ink);
  outline-offset: -2px;
}
.row:active {
  background: var(--eas-tab);
}
.row-main {
  min-width: 0;
}
.row-who {
  min-width: 0;
}
.row-who-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-amount-col {
  text-align: right;
  align-items: flex-end;
}
.row-main .cell-sub,
.row-who .cell-sub {
  overflow-wrap: anywhere;
}
.row-status {
  justify-self: start;
}
.row-amount {
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-16);
  font-weight: 600;
  line-height: 1.4;
  color: var(--eas-ink);
}
.row-amount-none {
  font-size: var(--eas-fs-sm);
  line-height: 1.4;
}

/* 待办行：申请两行 / 申请人两行 / 金额与时间两行 / 芥黄处理按钮 */
.task-row {
  grid-template-columns: minmax(0, 1fr) 96px 116px 68px;
}
.row-go {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 14px;
  border-radius: var(--eas-radius-pill);
  background-color: var(--eas-mustard);
  font-size: var(--eas-fs-note);
  font-weight: 600;
  color: var(--eas-ink);
  box-shadow: 3px 3px 0 var(--eas-mustard-deep);
  white-space: nowrap;
  visibility: hidden;
}
.row:hover .row-go,
.row:focus-visible .row-go,
.row:focus-within .row-go {
  visibility: visible;
}

/* 最近申请（无审批权限时）：申请两行 / 状态胶囊 / 金额与时间两行 */
.app-row {
  grid-template-columns: minmax(0, 1fr) auto 116px;
}

/* 管理入口 */
.admin-row {
  grid-template-columns: minmax(0, 1fr);
}

/* ---------- 发起申请：套色插画入口卡 ---------- */
.starts {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 18px;
  margin: 0;
  padding: 8px var(--eas-sheet-inset) var(--eas-sheet-inset);
  list-style: none;
}
.starts li {
  display: flex;
  min-width: 0;
}
.starts :deep(.apply-entry) {
  flex: 1;
}

/* ---------- 我的申请：小账单 ---------- */
.ledger-wrap {
  padding: 2px var(--eas-sheet-inset) 22px;
}
.ledger-bar {
  display: flex;
  gap: 3px;
  height: 18px;
  margin: 4px 0 12px;
  border-radius: 9px;
  overflow: hidden;
}
.ledger-seg {
  display: block;
  flex-basis: 0;
  min-width: 0;
  height: 100%;
}
.ledger {
  margin: 0;
  padding: 0;
  list-style: none;
}
.ledger li {
  border-bottom: 1px solid var(--eas-rule);
}
.ledger-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 -6px;
  padding: 7px 6px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--eas-ink);
  transition: background-color var(--eas-dur-fast) var(--eas-ease);
}
.ledger-line:hover {
  background: var(--eas-row-hover);
}
.ledger-line:focus-visible {
  outline: 2px solid var(--eas-ink);
  outline-offset: -2px;
}
.ledger-swatch {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 4px;
}
.ledger-swatch--sky {
  background-color: var(--eas-sky);
}
.ledger-swatch--sage {
  background-color: var(--eas-sage);
}
.ledger-swatch--rust {
  background-color: var(--eas-rust);
}
.ledger-swatch--draft {
  background-color: var(--eas-tab);
  box-shadow: inset 0 0 0 1px var(--eas-shade);
}
.ledger-swatch--muted {
  background-color: var(--eas-muted);
}
.ledger-count {
  margin-left: auto;
  font-family: var(--eas-font-display);
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ledger-total {
  margin-top: 14px;
  padding: 14px 18px;
  border-radius: 14px;
  background-color: var(--eas-ink);
  color: var(--eas-sheet);
  box-shadow: 4px 4px 0 var(--eas-mustard);
}
.ledger-total-label {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: var(--eas-fs-12);
  color: var(--eas-sky);
}
.ledger-total-amount {
  display: block;
  margin-top: 2px;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-32);
  font-weight: 600;
  line-height: 1.2;
  text-align: right;
  white-space: normal;
  overflow-wrap: anywhere;
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
.notices {
  margin: 0;
  padding: 0 var(--eas-sheet-inset) 16px;
  list-style: none;
}
.notices li + li {
  border-top: 1px solid var(--eas-rule);
}
.notice-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: calc(100% + 12px);
  box-sizing: border-box;
  margin: 0 -6px;
  padding: 9px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: var(--eas-fs-note);
  text-align: left;
  color: var(--eas-ink-2);
  cursor: pointer;
  transition: background-color var(--eas-dur-fast) var(--eas-ease);
}
.notice-row.unread {
  color: var(--eas-ink);
}
.notice-row:hover,
.notice-row:focus-visible {
  background: var(--eas-row-hover);
}
.notice-row:focus-visible {
  outline: 2px solid var(--eas-ink);
  outline-offset: -2px;
}
.notice-dot {
  flex: none;
  width: 9px;
  height: 9px;
  margin-top: 6px;
  border-radius: 50%;
  background: transparent;
}
.notice-row.unread .notice-dot {
  background-color: var(--eas-mustard);
}
.notice-title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.notice-time {
  flex: none;
  margin-left: auto;
  font-size: var(--eas-fs-12);
  font-variant-numeric: tabular-nums;
  color: var(--eas-ink-3);
  white-space: nowrap;
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
}
@media (max-width: 768px) {
  .workbench .sheet {
    --eas-sheet-inset: 16px;
  }
  .banner {
    padding: 24px 20px;
    background-position: left top;
    background-size: auto 140%;
  }
  .banner-title {
    font-size: var(--eas-fs-32);
    overflow-wrap: anywhere;
  }
  .starts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .task-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'main amount'
      'who go';
    gap: 8px 12px;
  }
  .task-row .row-main {
    grid-area: main;
  }
  .task-row .row-amount-col {
    grid-area: amount;
  }
  .task-row .row-who {
    grid-area: who;
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }
  .task-row .row-go {
    grid-area: go;
    visibility: visible;
  }
  .app-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'main amount'
      'status amount';
    gap: 6px 12px;
  }
  .app-row .row-main {
    grid-area: main;
  }
  .app-row .row-status {
    grid-area: status;
    justify-self: start;
  }
  .app-row .row-amount-col {
    grid-area: amount;
  }
}
/* 触屏没有悬停：处理按钮常显 */
@media (hover: none) {
  .row-go {
    visibility: visible;
  }
}
@media (prefers-reduced-motion: reduce) {
  .row,
  .ledger-line,
  .notice-row {
    transition: none;
  }
}
</style>
