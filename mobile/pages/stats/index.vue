<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onPullDownRefresh, onShow, onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import { formatCents, sumCents } from '@/lib/money'
import type { AppStatus, AppType, DeptOption, DeptStats, EnterpriseStats, FinanceStats, MonthlyRow, PersonalStats, StatsTotals } from '@/lib/types'
import EmptyState from '@/components/EmptyState.vue'
import UChart from '@/components/UChart.vue'
import { auth, requireLogin } from '@/stores/auth'
import { centsForChart, STATUS_CHART_COLORS, TOTAL_CHART_COLOR, type ChartData } from '@/utils/chart'
import { APP_STATUS_LABEL, APP_STATUS_ORDER, APP_TYPE_LABEL } from '@/utils/labels'
import { todayCN } from '@/utils/time'

type TabName = 'personal' | 'dept' | 'finance' | 'enterprise'
interface Metric { label: string; value: string; unit?: string; hint?: string }
/** 账单行的一格：类名里带上分隔线的位置（首列、末列、末行） */
interface LedgerCell extends Metric { cellClass: string }

const TAB_DEFS: { name: TabName; label: string; permission?: string }[] = [
  { name: 'personal', label: '个人' },
  { name: 'dept', label: '本部门', permission: 'STATS_DEPT' },
  { name: 'finance', label: '财务', permission: 'FIN_STATS' },
  { name: 'enterprise', label: '企业', permission: 'ENTERPRISE_STATS' },
]
const TYPE_ORDER: AppType[] = ['PURCHASE', 'TRAVEL', 'EXPENSE', 'CUSTOM']
const SUBMITTED_STATUSES = APP_STATUS_ORDER.filter((s) => s !== 'DRAFT')
const today = ref(todayCN())
const pad = (value: number): string => String(value).padStart(2, '0')

function monthStart(date: string, monthsBack: number): string {
  const index = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 - monthsBack
  return `${Math.floor(index / 12)}-${pad(index % 12 + 1)}-01`
}

const ready = ref(false)
const active = ref<TabName>('personal')
const from = ref(monthStart(todayCN(), 5))
const to = ref(todayCN())
const deptId = ref<number | null>(null)
const departments = ref<DeptOption[]>([])
const loading = ref(false)
const error = ref('')
const traceId = ref<string | null>(null)
const personal = ref<PersonalStats | null>(null)
const department = ref<DeptStats | null>(null)
const finance = ref<FinanceStats | null>(null)
const enterprise = ref<EnterpriseStats | null>(null)
const tabs = computed(() => TAB_DEFS.filter((tab) => !tab.permission || auth.can(tab.permission)))
const headDeptIds = computed(() => auth.state.me?.headDeptIds ?? [])
const accountId = computed(() => auth.state.me?.id ?? auth.state.userId)
const permissionsKey = computed(() => (auth.state.me?.permissions ?? []).slice().sort().join(','))
const deptOptions = computed(() => headDeptIds.value.map((id) => ({
  id,
  name: departments.value.find((dept) => dept.id === id)?.name
    ?? (auth.state.me?.deptId === id ? auth.state.me.deptName : null)
    ?? (department.value?.deptId === id ? department.value.deptName : null)
    ?? `部门 #${id}`,
})))
const deptIndex = computed(() => Math.max(0, deptOptions.value.findIndex((dept) => dept.id === deptId.value)))
const selectedDeptName = computed(() => deptOptions.value.find((dept) => dept.id === deptId.value)?.name ?? '未分配负责部门')
const rangeError = computed(() => from.value > to.value ? '开始日期不能晚于结束日期' : to.value > today.value ? '结束日期不能晚于今天（上海时区）' : '')
const displayedRange = computed(() => {
  const data = active.value === 'dept' ? department.value : active.value === 'finance' ? finance.value : enterprise.value
  return data ? `${data.from} 至 ${data.to}` : `${from.value} 至 ${to.value}`
})

let requestId = 0
let disposed = false
let departmentsLoading = false

function clearData(): void {
  personal.value = null
  department.value = null
  finance.value = null
  enterprise.value = null
}

function defaultDept(): number | null {
  const own = auth.state.me?.deptId
  return own != null && headDeptIds.value.includes(own) ? own : headDeptIds.value[0] ?? null
}

async function loadDepartmentNames(): Promise<void> {
  if (departmentsLoading || departments.value.length || !auth.can('STATS_DEPT')) return
  departmentsLoading = true
  const owner = accountId.value
  try {
    const result = await api.dict.departments()
    if (!disposed && accountId.value === owner) departments.value = result
  } catch {
    // 名称字典不影响统计请求；选择器保留部门编号，当前部门也可使用统计响应中的名称。
  } finally {
    departmentsLoading = false
  }
}

async function load(): Promise<void> {
  const current = ++requestId
  const owner = accountId.value
  clearData()
  error.value = ''
  traceId.value = null
  loading.value = false
  if (!ready.value || disposed || !auth.isLoggedIn || owner == null) return
  if (active.value !== 'personal' && rangeError.value) return
  if (!tabs.value.some((tab) => tab.name === active.value)) return
  if (active.value === 'dept' && deptId.value == null) {
    error.value = '当前账号没有负责部门，请联系管理员核对权限。'
    return
  }
  void loadDepartmentNames()
  loading.value = true
  const tab = active.value
  const query = { from: from.value, to: to.value }
  const selectedDept = deptId.value
  const valid = (): boolean => !disposed && current === requestId && accountId.value === owner
    && auth.isLoggedIn && active.value === tab && tabs.value.some((item) => item.name === tab)
    && (tab === 'personal' || (from.value === query.from && to.value === query.to))
    && (tab !== 'dept' || deptId.value === selectedDept)
  try {
    switch (tab) {
      case 'personal': {
        const result = await api.stats.personal()
        if (valid()) personal.value = result
        break
      }
      case 'dept': {
        const result = await api.stats.dept({ ...query, deptId: selectedDept })
        if (valid()) department.value = result
        break
      }
      case 'finance': {
        const result = await api.stats.finance(query)
        if (valid()) finance.value = result
        break
      }
      case 'enterprise': {
        const result = await api.stats.enterprise(query)
        if (valid()) enterprise.value = result
        break
      }
    }
  } catch (cause) {
    if (valid()) {
      const failure = toApiError(cause)
      error.value = failure.message
      traceId.value = failure.traceId
    }
  } finally {
    if (current === requestId) loading.value = false
  }
}

async function refresh(): Promise<void> {
  try {
    today.value = todayCN()
    await load()
  } finally {
    uni.stopPullDownRefresh()
  }
}

watch([active, from, to, deptId, permissionsKey, accountId, () => headDeptIds.value.join(',')], () => {
  if (!ready.value || disposed) return
  if (!tabs.value.some((tab) => tab.name === active.value)) {
    active.value = 'personal'
    return
  }
  if (deptId.value !== null && !headDeptIds.value.includes(deptId.value)) {
    deptId.value = defaultDept()
    return
  }
  if (deptId.value === null && headDeptIds.value.length) {
    deptId.value = defaultDept()
    return
  }
  void load()
})

onLoad(async (query) => {
  if (!(await requireLogin()) || disposed) return
  deptId.value = defaultDept()
  const initial = tabs.value.find((tab) => tab.name === query?.tab)
  if (initial) active.value = initial.name
  // 先等初始化的响应式更新完成，再启用请求监听，避免重复发起首次查询。
  await Promise.resolve()
  ready.value = true
  await load()
})
onShow(() => { if (ready.value) void refresh() })
onPullDownRefresh(() => { void refresh() })
onUnload(() => {
  disposed = true
  ++requestId
})

function eventValue(event: unknown): unknown {
  if (!event || typeof event !== 'object' || !('detail' in event)) return undefined
  const detail = event.detail
  return detail && typeof detail === 'object' && 'value' in detail ? detail.value : undefined
}

function changeDate(field: 'from' | 'to', event: unknown): void {
  const value = eventValue(event)
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return
  if (field === 'from') from.value = value
  else to.value = value
}

function changeDepartment(event: unknown): void {
  const index = Number(eventValue(event))
  if (Number.isInteger(index) && deptOptions.value[index]) deptId.value = deptOptions.value[index].id
}

function quickRange(months: number): void {
  today.value = todayCN()
  from.value = monthStart(today.value, months - 1)
  to.value = today.value
}

/** 快捷区间是否就是当前选中的区间（选中时给胶囊上藏青底） */
function shortcutActive(months: number): boolean {
  return from.value === monthStart(today.value, months - 1) && to.value === today.value
}

const money = (value: number): string => `¥${formatCents(value)}`

function ratio(value: number | null): { value: string; unit?: string } {
  if (value == null) return { value: '—' }
  return { value: (value * 100).toFixed(1), unit: '%' }
}

function duration(value: number | null): { value: string; unit?: string } {
  if (value == null) return { value: '—' }
  return { value: value.toFixed(1), unit: '小时' }
}

function totalMetrics(totals: StatsTotals): Metric[] {
  return [
    { label: '非草稿申请', value: String(totals.count), unit: '单' },
    { label: '已通过', value: String(totals.approvedCount), unit: '单' },
    { label: '已驳回', value: String(totals.rejectedCount), unit: '单' },
    { label: '审批中', value: String(totals.inApprovalCount), unit: '单' },
    { label: '已通过金额', value: money(totals.approvedAmountCents) },
    { label: '在途金额', value: money(totals.inProgressAmountCents), hint: '单独统计，不计入已通过金额' },
    { label: '通过率', ...ratio(totals.approvalRate), hint: '已通过 /（已通过 + 已驳回）' },
    { label: '平均审批时长', ...duration(totals.avgApprovalHours), hint: '仅含已通过、已驳回申请' },
  ]
}

const personalMetrics = computed<Metric[]>(() => personal.value ? [
  { label: '我的待办', value: String(personal.value.pendingTaskCount), unit: '单' },
  { label: '已通过申请', value: String(personal.value.approvedCount), unit: '单' },
  { label: '已通过金额', value: money(personal.value.approvedAmountCents) },
] : [])
const departmentMetrics = computed(() => department.value ? totalMetrics(department.value.totals) : [])
const financeMetrics = computed<Metric[]>(() => finance.value ? [
  { label: '无票明细数', value: String(finance.value.noInvoice.count), unit: '条' },
  { label: '无票金额', value: money(finance.value.noInvoice.amountCents) },
  { label: '无票金额占比', ...ratio(finance.value.noInvoice.ratio), hint: '占已通过报销明细总金额' },
  { label: '部门报销金额合计', value: money(sumCents(finance.value.byDept.map((row) => row.expenseAmountCents))) },
  { label: '部门采购金额合计', value: money(sumCents(finance.value.byDept.map((row) => row.purchaseAmountCents))) },
] : [])
const enterpriseMetrics = computed<Metric[]>(() => enterprise.value ? [
  { label: '部门数量', value: String(enterprise.value.byDept.length), unit: '个' },
  { label: '非草稿申请合计', value: String(enterprise.value.byDept.reduce((sum, row) => sum + row.count, 0)), unit: '单' },
  { label: '已通过金额合计', value: money(sumCents(enterprise.value.byDept.map((row) => row.approvedAmountCents))) },
  { label: '在途金额合计', value: money(sumCents(enterprise.value.byDept.map((row) => row.inProgressAmountCents))) },
] : [])

/**
 * 账单行：两列网格，指标之间用虚线分隔（竖线在两列之间，横线在行与行之间）。
 * 末列、末行的虚线去掉，避免边上出现断口。
 */
function toLedger(metrics: Metric[], compactNumbers = true): LedgerCell[] {
  const columns = 2
  const rows = Math.ceil(metrics.length / columns)
  return metrics.map((metric, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    const lastRow = row === rows - 1
    const countInRow = lastRow ? metrics.length - row * columns : columns
    const classes = ['ledger-cell']
    if (column === 0) classes.push('ledger-cell--first')
    if (column === countInRow - 1) classes.push('ledger-cell--last')
    if (lastRow) classes.push('ledger-cell--bottom')
    if (compactNumbers && metric.value.length > 6) classes.push('ledger-cell--compact')
    return { ...metric, cellClass: classes.join(' ') }
  })
}

const ledgerMetrics = computed<Metric[]>(() => {
  if (active.value === 'personal') return personalMetrics.value
  if (active.value === 'dept') return departmentMetrics.value
  if (active.value === 'finance') return financeMetrics.value
  return enterpriseMetrics.value
})
const ledgerCells = computed<LedgerCell[]>(() => toLedger(ledgerMetrics.value))
const deptMetricCells = (totals: StatsTotals): LedgerCell[] => toLedger(totalMetrics(totals), false)

function statusChart(counts: Partial<Record<AppStatus, number>>, statuses: AppStatus[]): ChartData | null {
  const series = statuses.filter((status) => (counts[status] ?? 0) > 0).map((status) => ({
    name: APP_STATUS_LABEL[status], data: counts[status] ?? 0, color: STATUS_CHART_COLORS[status],
  }))
  return series.length ? { series } : null
}

const personalChart = computed(() => personal.value ? statusChart(personal.value.statusCounts, APP_STATUS_ORDER) : null)
const deptStatusCounts = computed(() => {
  const counts: Partial<Record<AppStatus, number>> = {}
  for (const row of department.value?.byTypeStatus ?? []) counts[row.status] = (counts[row.status] ?? 0) + row.count
  return counts
})
const deptStatusChart = computed(() => statusChart(deptStatusCounts.value, SUBMITTED_STATUSES))
const deptTypeChart = computed<ChartData | null>(() => {
  const rows = department.value?.byTypeStatus ?? []
  if (!rows.some((row) => row.count > 0)) return null
  return {
    categories: TYPE_ORDER.map((type) => APP_TYPE_LABEL[type]),
    series: SUBMITTED_STATUSES.map((status) => ({
      name: APP_STATUS_LABEL[status], color: STATUS_CHART_COLORS[status],
      data: TYPE_ORDER.map((type) => rows.filter((row) => row.type === type && row.status === status).reduce((sum, row) => sum + row.count, 0)),
    })),
  }
})
const deptTypeCards = computed(() => TYPE_ORDER.map((type) => ({
  type,
  rows: SUBMITTED_STATUSES.map((status) => ({
    status,
    count: (department.value?.byTypeStatus ?? []).filter((row) => row.type === type && row.status === status).reduce((sum, row) => sum + row.count, 0),
  })),
})))

// 趋势补齐最近 12 个自然月内的零值；完整区间仍在月份数字卡片中展示。
const monthlyRows = computed(() => (department.value?.monthly ?? []).slice().sort((a, b) => a.month.localeCompare(b.month)))
const trendRows = computed(() => {
  const data = department.value
  if (!data) return []
  const start = Number(data.from.slice(0, 4)) * 12 + Number(data.from.slice(5, 7)) - 1
  const end = Number(data.to.slice(0, 4)) * 12 + Number(data.to.slice(5, 7)) - 1
  const rows: MonthlyRow[] = []
  for (let index = Math.max(start, end - 11); index <= end; index++) {
    const month = `${Math.floor(index / 12)}-${pad(index % 12 + 1)}`
    rows.push(data.monthly.find((row) => row.month === month) ?? { month, count: 0, approvedAmountCents: 0 })
  }
  return rows
})
const monthlyCountChart = computed<ChartData>(() => ({ categories: trendRows.value.map((row) => row.month.slice(2)), series: [{ name: '申请数（单）', data: trendRows.value.map((row) => row.count) }] }))
const monthlyAmountChart = computed<ChartData>(() => ({ categories: trendRows.value.map((row) => row.month.slice(2)), series: [{ name: '已通过金额（元）', data: trendRows.value.map((row) => centsForChart(row.approvedAmountCents)) }] }))

const expenseTypeChart = computed<ChartData | null>(() => {
  const rows = finance.value?.byExpenseType.slice(0, 8) ?? []
  return rows.some((row) => row.approvedAmountCents > 0) ? {
    categories: rows.map((row) => row.name),
    series: [{ name: '已通过金额（元）', data: rows.map((row) => centsForChart(row.approvedAmountCents)) }],
  } : null
})
const enterpriseChart = computed<ChartData | null>(() => {
  const rows = enterprise.value?.byDept.slice(0, 8) ?? []
  if (!rows.some((row) => row.count > 0)) return null
  return {
    categories: rows.map((row) => row.deptName),
    series: [
      { name: '申请数', color: TOTAL_CHART_COLOR, data: rows.map((row) => row.count) },
      { name: '已通过', color: STATUS_CHART_COLORS.APPROVED, data: rows.map((row) => row.approvedCount) },
      { name: '已驳回', color: STATUS_CHART_COLORS.REJECTED, data: rows.map((row) => row.rejectedCount) },
      { name: '审批中', color: STATUS_CHART_COLORS.IN_APPROVAL, data: rows.map((row) => row.inApprovalCount) },
    ],
  }
})
const countChartOptions: Record<string, unknown> = { yAxis: { data: [{ min: 0, tofix: 0 }] }, xAxis: { rotateLabel: true, fontSize: 12, disableGrid: true } }
const stackedOptions: Record<string, unknown> = { ...countChartOptions, extra: { column: { type: 'stack' } } }
const moneyChartOptions: Record<string, unknown> = { xAxis: { rotateLabel: true, fontSize: 12, disableGrid: true } }
// 环形图、饼图下面由页面自己列出状态，图例不再重复画一遍。
const noLegendOptions: Record<string, unknown> = { legend: { show: false } }
</script>

<template>
  <view class="stats">
    <view class="definition">按提交时间统计；已通过金额仅含已通过申请；部门以提交时所属部门为准</view>

    <view class="seg">
      <view
        v-for="tab in tabs"
        :key="tab.name"
        class="seg-item"
        :class="{ active: active === tab.name }"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="active = tab.name"
      >
        {{ tab.label }}
      </view>
    </view>

    <view v-if="active === 'personal'" class="banner banner-info">个人统计为全量数据，不按日期筛选；状态分布包含草稿。部门和企业统计不包含草稿。</view>
    <view v-if="active === 'finance'" class="banner banner-info">财务金额仅含已通过申请；无票占比按已通过报销明细金额计算。</view>

    <view v-if="active !== 'personal'" class="card filter-card">
      <view class="card-title">提交日期（上海时区）</view>
      <view class="date-range">
        <picker class="date-pick" mode="date" :value="from" :end="to < today ? to : today" @change="changeDate('from', $event)">
          <view class="date-part" hover-class="is-pressed" :hover-stay-time="60">{{ from }}</view>
        </picker>
        <text class="date-sep">至</text>
        <picker class="date-pick" mode="date" :value="to" :start="from" :end="today" @change="changeDate('to', $event)">
          <view class="date-part date-part--end" hover-class="is-pressed" :hover-stay-time="60">
            <text>{{ to }}</text>
            <view class="chevron" />
          </view>
        </picker>
      </view>
      <view class="shortcuts">
        <view class="filter-chip" :class="{ active: shortcutActive(1) }" hover-class="is-pressed" :hover-stay-time="60" @tap="quickRange(1)">本月</view>
        <view class="filter-chip" :class="{ active: shortcutActive(3) }" hover-class="is-pressed" :hover-stay-time="60" @tap="quickRange(3)">近 3 个月</view>
        <view class="filter-chip" :class="{ active: shortcutActive(6) }" hover-class="is-pressed" :hover-stay-time="60" @tap="quickRange(6)">近 6 个月</view>
      </view>
      <view v-if="rangeError" class="err">{{ rangeError }}</view>
      <view v-if="active === 'dept'" class="dept-field">
        <view class="field-label">负责部门</view>
        <picker v-if="deptOptions.length > 1" :range="deptOptions" range-key="name" :value="deptIndex" @change="changeDepartment">
          <view class="picker-value" hover-class="is-pressed" :hover-stay-time="60">
            <text class="ellipsis">{{ selectedDeptName }}</text>
            <view class="chevron" />
          </view>
        </picker>
        <view v-else class="dept-fixed">{{ selectedDeptName }}</view>
      </view>
    </view>

    <view class="refresh-row">
      <text class="note flex1">{{ active === 'personal' ? '全量数据' : displayedRange }}</text>
      <button
        class="refresh-button"
        hover-class="is-pressed"
        :hover-stay-time="60"
        :disabled="loading || !ready"
        :loading="loading"
        @tap="refresh"
      >
        刷新
      </button>
    </view>

    <view v-if="loading" class="card">
      <EmptyState kind="none" text="正在加载统计数据…" />
    </view>
    <view v-else-if="error" class="card">
      <EmptyState kind="none" :text="error" action-text="重试" @action="refresh" />
      <view v-if="traceId" class="note break">追踪号：{{ traceId }}</view>
    </view>

    <template v-else>
      <view v-if="ledgerCells.length" class="card ledger">
        <view class="ledger-grid">
          <view v-for="cell in ledgerCells" :key="cell.label" class="ledger-cell" :class="cell.cellClass">
            <view class="ledger-label">{{ cell.label }}</view>
            <view class="ledger-value">
              <text class="ledger-num">{{ cell.value }}</text>
              <text v-if="cell.unit" class="ledger-unit">{{ cell.unit }}</text>
            </view>
            <view v-if="cell.hint" class="ledger-hint">{{ cell.hint }}</view>
          </view>
        </view>
      </view>

      <template v-if="active === 'personal' && personal">
        <view class="card">
          <view class="card-title">
            <view class="card-title-row"><view class="ink-glyph ink-glyph--leaf" /><text>我的申请状态</text></view>
          </view>
          <UChart v-if="personalChart" type="ring" :data="personalChart" :opts="noLegendOptions" />
          <EmptyState v-else text="尚无申请，可从“发起”创建申请" />
          <view v-if="personalChart" class="divider" />
          <view v-for="status in APP_STATUS_ORDER" :key="status" class="data-row">
            <view class="status"><text class="dot" :style="{ background: STATUS_CHART_COLORS[status] }" /><text>{{ APP_STATUS_LABEL[status] }}</text></view>
            <text class="amount">{{ personal.statusCounts[status] ?? 0 }} 单</text>
          </view>
        </view>
      </template>

      <template v-else-if="active === 'dept' && department">
        <view class="section-title">{{ department.deptName }}</view>
        <view v-if="department.totals.count === 0" class="card">
          <EmptyState text="所选区间内暂无已提交申请" />
        </view>
        <view class="card">
          <view class="card-title">
            <view class="card-title-row"><view class="ink-glyph ink-glyph--stack" /><text>各类申请数量与状态</text></view>
          </view>
          <UChart v-if="deptTypeChart" type="column" :data="deptTypeChart" :opts="stackedOptions" />
          <EmptyState v-else text="所选区间内暂无已提交申请" />
          <view v-if="deptTypeChart" class="divider" />
          <view v-for="item in deptTypeCards" :key="item.type" class="detail-item">
            <view class="bold">{{ APP_TYPE_LABEL[item.type] }}</view>
            <view class="status-numbers">
              <text v-for="row in item.rows" :key="row.status">{{ APP_STATUS_LABEL[row.status] }} {{ row.count }} 单</text>
            </view>
          </view>
        </view>
        <view class="card">
          <view class="card-title">状态分布</view>
          <UChart v-if="deptStatusChart" type="pie" :data="deptStatusChart" :opts="noLegendOptions" />
          <EmptyState v-else text="所选区间内暂无已提交申请" />
          <view v-if="deptStatusChart" class="divider" />
          <view v-for="status in SUBMITTED_STATUSES" :key="status" class="data-row">
            <view class="status"><text class="dot" :style="{ background: STATUS_CHART_COLORS[status] }" /><text>{{ APP_STATUS_LABEL[status] }}</text></view>
            <text class="amount">{{ deptStatusCounts[status] ?? 0 }} 单</text>
          </view>
        </view>
        <view class="card">
          <view class="card-title">月度趋势（按提交月份）</view>
          <view class="note">图表展示区间内最近 12 个月，缺少数据的月份按 0 显示。金额单位：元。</view>
          <template v-if="department.totals.count > 0">
            <UChart type="line" :data="monthlyCountChart" :opts="countChartOptions" :height="420" />
            <UChart type="line" :data="monthlyAmountChart" :opts="moneyChartOptions" :height="420" />
          </template>
          <EmptyState v-else text="暂无月度趋势" />
          <view v-if="monthlyRows.length" class="note mt">完整区间月度明细（未列出的月份均为 0）</view>
          <view v-for="row in monthlyRows" :key="row.month" class="detail-item">
            <view class="data-row"><text class="bold">{{ row.month }}</text><text class="amount">{{ row.count }} 单</text></view>
            <view class="data-row"><text class="note">已通过金额</text><text class="amount">{{ money(row.approvedAmountCents) }}</text></view>
          </view>
        </view>
      </template>

      <template v-else-if="active === 'finance' && finance">
        <view class="card">
          <view class="card-title">
            <view class="card-title-row"><view class="ink-glyph ink-glyph--sun" /><text>各费用类型的报销已通过金额</text></view>
          </view>
          <view v-if="finance.byExpenseType.length > 8" class="note">图表展示前 8 个费用类型，完整数据见下方。</view>
          <UChart v-if="expenseTypeChart" type="column" :data="expenseTypeChart" :opts="moneyChartOptions" />
          <EmptyState v-else text="所选区间内暂无已通过的报销" />
          <view v-if="finance.byExpenseType.length" class="divider" />
          <view v-for="row in finance.byExpenseType" :key="row.code" class="detail-item">
            <view class="data-row"><text class="bold wrap-name">{{ row.name }}</text><text class="amount">{{ money(row.approvedAmountCents) }}</text></view>
            <view class="note">{{ row.itemCount }} 条明细</view>
          </view>
        </view>
        <view class="card">
          <view class="card-title">各部门报销与采购已通过金额</view>
          <EmptyState v-if="!finance.byDept.length" text="所选区间内暂无部门财务数据" />
          <view v-for="row in finance.byDept" :key="row.deptId" class="detail-item">
            <view class="bold break">{{ row.deptName }}</view>
            <view class="data-row"><text class="note">报销已通过金额</text><text class="amount">{{ money(row.expenseAmountCents) }}</text></view>
            <view class="data-row"><text class="note">采购已通过金额</text><text class="amount">{{ money(row.purchaseAmountCents) }}</text></view>
          </view>
        </view>
      </template>

      <template v-else-if="active === 'enterprise' && enterprise">
        <view class="card">
          <view class="card-title">
            <view class="card-title-row"><view class="ink-glyph ink-glyph--hill" /><text>各部门申请数量对比</text></view>
          </view>
          <view v-if="enterprise.byDept.length > 8" class="note">图表展示前 8 个部门，完整数据见下方。</view>
          <UChart v-if="enterpriseChart" type="column" :data="enterpriseChart" :opts="countChartOptions" :height="540" />
          <EmptyState v-else text="所选区间内暂无已提交申请" />
        </view>
        <view v-for="row in enterprise.byDept" :key="row.deptId" class="card">
          <view class="card-title break">{{ row.deptName }}</view>
          <view class="ledger-grid ledger-grid--mini">
            <view v-for="cell in deptMetricCells(row)" :key="cell.label" class="ledger-cell" :class="cell.cellClass">
              <view class="ledger-label">{{ cell.label }}</view>
              <view class="ledger-value">
                <text class="ledger-num">{{ cell.value }}</text>
                <text v-if="cell.unit" class="ledger-unit">{{ cell.unit }}</text>
              </view>
            </view>
          </view>
        </view>
        <view class="note">通过率 = 已通过 /（已通过 + 已驳回）；平均审批时长仅含已通过、已驳回申请；“—”表示没有可计算的数据。</view>
      </template>
    </template>
  </view>
</template>

<style scoped>
.stats {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom));
  background: var(--eas-desk);
  color: var(--eas-ink);
  font-family: var(--eas-font-sans);
}

.definition {
  margin: 4rpx 8rpx 24rpx;
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-3);
}

.filter-card {
  padding: 24rpx 32rpx 28rpx;
}

.card-title-row {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* ---------- 日期区间：一张底色胶囊，右侧箭头表示可以选 ---------- */
.date-range {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 24rpx;
  background: var(--eas-field);
  border: 3rpx solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
}

.date-pick {
  flex: 1;
  min-width: 0;
}

.date-part {
  display: flex;
  align-items: center;
  height: 88rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
}

.date-part--end {
  justify-content: flex-end;
}

.date-sep {
  margin: 0 16rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}

.chevron {
  flex: none;
  width: 14rpx;
  height: 14rpx;
  margin-left: 20rpx;
  border-right: 3rpx solid var(--eas-ink-3);
  border-bottom: 3rpx solid var(--eas-ink-3);
  transform: rotate(-45deg);
}

.shortcuts {
  display: flex;
  margin-top: 20rpx;
}

.err {
  margin-top: 12rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-danger);
}

.dept-field {
  margin-top: 24rpx;
}

.field-label {
  margin-bottom: 12rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}

.dept-fixed {
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
}

.refresh-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: -8rpx 8rpx 16rpx 0;
}

.refresh-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 120rpx;
  min-height: 88rpx;
  margin: 0;
  padding: 0 16rpx;
  font-size: var(--eas-fs-sm);
  font-weight: 600;
  color: var(--eas-link);
  background: transparent;
  border-radius: var(--eas-radius-pill);
}

.refresh-button::after {
  border: 0;
}

/* ---------- 账单行：指标横排两列，虚线分隔 ---------- */
.ledger {
  --ledger-num-size: 48rpx;
  padding: 20rpx 32rpx 28rpx;
}

.ledger-grid {
  display: flex;
  flex-wrap: wrap;
}

.ledger-cell {
  width: 50%;
  box-sizing: border-box;
  padding: 20rpx 24rpx;
  border-right: 4rpx dashed var(--eas-rule);
  border-bottom: 4rpx dashed var(--eas-rule);
}

.ledger-cell--first {
  padding-left: 0;
}

.ledger-cell--last {
  padding-right: 0;
  border-right: none;
}

.ledger-cell--bottom {
  border-bottom: none;
}

.ledger-label {
  font-size: var(--eas-fs-xs);
  line-height: 1.5;
  color: var(--eas-ink-3);
}

.ledger-value {
  display: flex;
  align-items: baseline;
  margin-top: 8rpx;
  min-width: 0;
}

.ledger-num {
  font-family: var(--eas-font-display);
  font-weight: 700;
  font-size: var(--ledger-num-size);
  line-height: 1.2;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
  font-variant-numeric: tabular-nums;
  /* 大额不省略：放不下就折行，财务数字要能读全 */
  min-width: 0;
  word-break: break-all;
}

.ledger-cell--compact .ledger-num {
  font-size: calc(var(--ledger-num-size) * 0.75);
}

.ledger-unit {
  flex: none;
  margin-left: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}

.ledger-hint {
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--eas-ink-3);
}

/* 部门单据里的明细行：数值比账单行小一号 */
.ledger-grid--mini {
  --ledger-num-size: 32rpx;
}

.note {
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-3);
}

.data-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding: 12rpx 0;
}

.data-row > text:last-child {
  text-align: right;
  word-break: break-all;
}

.data-row > text:first-child {
  min-width: 0;
}

.status {
  display: flex;
  align-items: center;
}

.dot {
  flex: none;
  width: 16rpx;
  height: 16rpx;
  margin-right: 12rpx;
  border-radius: 50%;
}

.wrap-name {
  flex: 1;
  word-break: break-all;
}

.detail-item {
  padding: 20rpx 0;
  border-top: 1rpx solid var(--eas-rule);
}

.detail-item:first-child,
.divider + .detail-item {
  border-top: none;
}

.status-numbers {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}

.status-numbers text {
  width: 50%;
  padding: 6rpx 0;
}
</style>
