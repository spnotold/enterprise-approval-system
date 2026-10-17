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
import { centsForChart, type ChartData } from '@/utils/chart'
import { APP_STATUS_LABEL, APP_STATUS_ORDER, APP_TYPE_LABEL } from '@/utils/labels'
import { todayCN } from '@/utils/time'

type TabName = 'personal' | 'dept' | 'finance' | 'enterprise'
interface Metric { label: string; value: string; hint?: string }

const TAB_DEFS: { name: TabName; label: string; permission?: string }[] = [
  { name: 'personal', label: '个人' },
  { name: 'dept', label: '本部门', permission: 'STATS_DEPT' },
  { name: 'finance', label: '财务', permission: 'FIN_STATS' },
  { name: 'enterprise', label: '企业', permission: 'ENTERPRISE_STATS' },
]
const TYPE_ORDER: AppType[] = ['PURCHASE', 'TRAVEL', 'EXPENSE', 'CUSTOM']
// 列表里的状态圆点：草稿、已撤回都是灰（docs/ui_design.md 第 2 节）
const STATUS_TONE: Record<AppStatus, 'muted' | 'primary' | 'success' | 'danger'> = {
  DRAFT: 'muted',
  IN_APPROVAL: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'muted',
}
// 图表 canvas 读不到 CSS 变量，色值镜像 tokens.css；草稿与已撤回在同一图里要能分辨，已撤回改用浅黛
const STATUS_CHART_COLOR: Record<AppStatus, string> = {
  DRAFT: '#7a858c',
  IN_APPROVAL: '#3e5c76',
  APPROVED: '#4f7a5c',
  REJECTED: '#9c4a3e',
  WITHDRAWN: '#8a9fb3',
}
const TOTAL_CHART_COLOR = '#7a858c'
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

const money = (value: number): string => `¥${formatCents(value)}`
const percent = (value: number | null): string => value == null ? '—' : `${(value * 100).toFixed(1)}%`
const hours = (value: number | null): string => value == null ? '—' : `${value.toFixed(1)} 小时`

function totalMetrics(totals: StatsTotals): Metric[] {
  return [
    { label: '非草稿申请', value: `${totals.count} 单` },
    { label: '已通过', value: `${totals.approvedCount} 单` },
    { label: '已驳回', value: `${totals.rejectedCount} 单` },
    { label: '审批中', value: `${totals.inApprovalCount} 单` },
    { label: '已通过金额', value: money(totals.approvedAmountCents) },
    { label: '在途金额', value: money(totals.inProgressAmountCents), hint: '单独统计，不计入已通过金额' },
    { label: '通过率', value: percent(totals.approvalRate), hint: '已通过 /（已通过 + 已驳回）' },
    { label: '平均审批时长', value: hours(totals.avgApprovalHours), hint: '仅含已通过、已驳回申请' },
  ]
}

const personalMetrics = computed<Metric[]>(() => personal.value ? [
  { label: '我的待办', value: `${personal.value.pendingTaskCount} 单` },
  { label: '已通过申请', value: `${personal.value.approvedCount} 单` },
  { label: '已通过金额', value: money(personal.value.approvedAmountCents) },
] : [])
const departmentMetrics = computed(() => department.value ? totalMetrics(department.value.totals) : [])

function statusChart(counts: Partial<Record<AppStatus, number>>, statuses: AppStatus[]): ChartData | null {
  const series = statuses.filter((status) => (counts[status] ?? 0) > 0).map((status) => ({
    name: APP_STATUS_LABEL[status], data: counts[status] ?? 0, color: STATUS_CHART_COLOR[status],
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
      name: APP_STATUS_LABEL[status], color: STATUS_CHART_COLOR[status],
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
const financeMetrics = computed<Metric[]>(() => finance.value ? [
  { label: '无票明细数', value: `${finance.value.noInvoice.count} 条` },
  { label: '无票金额', value: money(finance.value.noInvoice.amountCents) },
  { label: '无票金额占比', value: percent(finance.value.noInvoice.ratio), hint: '占已通过报销明细总金额' },
  { label: '部门报销金额合计', value: money(sumCents(finance.value.byDept.map((row) => row.expenseAmountCents))) },
  { label: '部门采购金额合计', value: money(sumCents(finance.value.byDept.map((row) => row.purchaseAmountCents))) },
] : [])
const enterpriseChart = computed<ChartData | null>(() => {
  const rows = enterprise.value?.byDept.slice(0, 8) ?? []
  if (!rows.some((row) => row.count > 0)) return null
  return {
    categories: rows.map((row) => row.deptName),
    series: [
      { name: '申请数', color: TOTAL_CHART_COLOR, data: rows.map((row) => row.count) },
      { name: '已通过', color: STATUS_CHART_COLOR.APPROVED, data: rows.map((row) => row.approvedCount) },
      { name: '已驳回', color: STATUS_CHART_COLOR.REJECTED, data: rows.map((row) => row.rejectedCount) },
      { name: '审批中', color: STATUS_CHART_COLOR.IN_APPROVAL, data: rows.map((row) => row.inApprovalCount) },
    ],
  }
})
const enterpriseMetrics = computed<Metric[]>(() => enterprise.value ? [
  { label: '部门数量', value: `${enterprise.value.byDept.length} 个` },
  { label: '非草稿申请合计', value: `${enterprise.value.byDept.reduce((sum, row) => sum + row.count, 0)} 单` },
  { label: '已通过金额合计', value: money(sumCents(enterprise.value.byDept.map((row) => row.approvedAmountCents))) },
  { label: '在途金额合计', value: money(sumCents(enterprise.value.byDept.map((row) => row.inProgressAmountCents))) },
] : [])
const countChartOptions: Record<string, unknown> = { yAxis: { data: [{ min: 0, tofix: 0 }] }, xAxis: { rotateLabel: true, fontSize: 12, disableGrid: true } }
const stackedOptions: Record<string, unknown> = { ...countChartOptions, extra: { column: { type: 'stack' } } }
const moneyChartOptions: Record<string, unknown> = { xAxis: { rotateLabel: true, fontSize: 12, disableGrid: true } }
</script>

<template>
  <view class="stats">
    <view class="definition">按提交时间统计；已通过金额仅含已通过申请；部门以提交时所属部门为准</view>
    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.name"
        class="tab"
        :class="{ 'tab--active': active === tab.name }"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="active = tab.name"
      >
        {{ tab.label }}
      </view>
    </view>

    <view v-if="active === 'personal'" class="notice notice--warning">个人统计为全量数据，不按日期筛选；状态分布包含草稿。部门和企业统计不包含草稿。</view>
    <view v-else class="panel">
      <view class="panel-title">提交日期（上海时区）</view>
      <view class="date-range">
        <picker class="date-picker" mode="date" :value="from" :end="to < today ? to : today" @change="changeDate('from', $event)">
          <view class="pick" hover-class="is-pressed" :hover-stay-time="60">{{ from }}</view>
        </picker>
        <text class="date-separator">至</text>
        <picker class="date-picker" mode="date" :value="to" :start="from" :end="today" @change="changeDate('to', $event)">
          <view class="pick" hover-class="is-pressed" :hover-stay-time="60">{{ to }}</view>
        </picker>
      </view>
      <view class="shortcuts">
        <view class="chip" hover-class="is-pressed" :hover-stay-time="60" @tap="quickRange(1)">本月</view>
        <view class="chip" hover-class="is-pressed" :hover-stay-time="60" @tap="quickRange(3)">近 3 个月</view>
        <view class="chip" hover-class="is-pressed" :hover-stay-time="60" @tap="quickRange(6)">近 6 个月</view>
      </view>
      <view v-if="rangeError" class="err">{{ rangeError }}</view>
      <view v-if="active === 'dept'" class="dept-field">
        <view class="label">负责部门</view>
        <picker v-if="deptOptions.length > 1" :range="deptOptions" range-key="name" :value="deptIndex" @change="changeDepartment">
          <view class="pick pick--between" hover-class="is-pressed" :hover-stay-time="60">
            <text class="ellipsis">{{ selectedDeptName }}</text>
            <text class="pick-action">切换</text>
          </view>
        </picker>
        <view v-else class="bold">{{ selectedDeptName }}</view>
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
    <view v-if="loading" class="panel"><EmptyState text="正在加载统计数据…" /></view>
    <view v-else-if="error" class="panel">
      <EmptyState :text="error" action-text="重试" @action="refresh" />
      <view v-if="traceId" class="note break">追踪号：{{ traceId }}</view>
    </view>

    <template v-else-if="active === 'personal' && personal">
      <view class="metric-grid">
        <view v-for="metric in personalMetrics" :key="metric.label" class="metric"><view class="note">{{ metric.label }}</view><view class="metric-value">{{ metric.value }}</view></view>
      </view>
      <view class="panel">
        <view class="panel-title">我的申请状态</view>
        <UChart v-if="personalChart" type="ring" :data="personalChart" />
        <EmptyState v-else text="尚无申请，可从“发起”创建申请" />
        <view v-for="status in APP_STATUS_ORDER" :key="status" class="data-row">
          <view class="status"><text class="dot" :class="`dot--${STATUS_TONE[status]}`" /><text>{{ APP_STATUS_LABEL[status] }}</text></view>
          <text class="amount">{{ personal.statusCounts[status] ?? 0 }} 单</text>
        </view>
      </view>
    </template>

    <template v-else-if="active === 'dept' && department">
      <view class="section">{{ department.deptName }}</view>
      <view class="metric-grid">
        <view v-for="metric in departmentMetrics" :key="metric.label" class="metric"><view class="note">{{ metric.label }}</view><view class="metric-value">{{ metric.value }}</view><view v-if="metric.hint" class="metric-hint">{{ metric.hint }}</view></view>
      </view>
      <view v-if="department.totals.count === 0" class="panel"><EmptyState text="所选区间内暂无已提交申请" /></view>
      <view class="panel">
        <view class="panel-title">各类申请数量与状态</view>
        <UChart v-if="deptTypeChart" type="column" :data="deptTypeChart" :opts="stackedOptions" />
        <view v-for="item in deptTypeCards" :key="item.type" class="detail-item">
          <view class="bold">{{ APP_TYPE_LABEL[item.type] }}</view>
          <view class="status-numbers"><text v-for="row in item.rows" :key="row.status">{{ APP_STATUS_LABEL[row.status] }} {{ row.count }} 单</text></view>
        </view>
      </view>
      <view class="panel">
        <view class="panel-title">状态分布</view>
        <UChart v-if="deptStatusChart" type="pie" :data="deptStatusChart" />
        <view v-for="status in SUBMITTED_STATUSES" :key="status" class="data-row">
          <view class="status"><text class="dot" :class="`dot--${STATUS_TONE[status]}`" /><text>{{ APP_STATUS_LABEL[status] }}</text></view>
          <text class="amount">{{ deptStatusCounts[status] ?? 0 }} 单</text>
        </view>
      </view>
      <view class="panel">
        <view class="panel-title">月度趋势（按提交月份）</view>
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
      <view class="notice">财务金额仅含已通过申请；无票占比按已通过报销明细金额计算。</view>
      <view class="metric-grid">
        <view v-for="metric in financeMetrics" :key="metric.label" class="metric"><view class="note">{{ metric.label }}</view><view class="metric-value">{{ metric.value }}</view><view v-if="metric.hint" class="metric-hint">{{ metric.hint }}</view></view>
      </view>
      <view class="panel">
        <view class="panel-title">各费用类型的报销已通过金额</view>
        <view v-if="finance.byExpenseType.length > 8" class="note">图表展示前 8 个费用类型，完整数据见下方。</view>
        <UChart v-if="expenseTypeChart" type="column" :data="expenseTypeChart" :opts="moneyChartOptions" />
        <EmptyState v-if="!finance.byExpenseType.length" text="所选区间内暂无已通过的报销" />
        <view v-for="row in finance.byExpenseType" :key="row.code" class="detail-item">
          <view class="data-row"><text class="bold wrap-name">{{ row.name }}</text><text class="amount">{{ money(row.approvedAmountCents) }}</text></view>
          <view class="note">{{ row.itemCount }} 条明细</view>
        </view>
      </view>
      <view class="panel">
        <view class="panel-title">各部门报销与采购已通过金额</view>
        <EmptyState v-if="!finance.byDept.length" text="所选区间内暂无部门财务数据" />
        <view v-for="row in finance.byDept" :key="row.deptId" class="detail-item">
          <view class="bold break">{{ row.deptName }}</view>
          <view class="data-row"><text class="note">报销已通过金额</text><text class="amount">{{ money(row.expenseAmountCents) }}</text></view>
          <view class="data-row"><text class="note">采购已通过金额</text><text class="amount">{{ money(row.purchaseAmountCents) }}</text></view>
        </view>
      </view>
    </template>

    <template v-else-if="active === 'enterprise' && enterprise">
      <view class="metric-grid">
        <view v-for="metric in enterpriseMetrics" :key="metric.label" class="metric"><view class="note">{{ metric.label }}</view><view class="metric-value">{{ metric.value }}</view></view>
      </view>
      <view class="panel">
        <view class="panel-title">各部门申请数量对比</view>
        <view v-if="enterprise.byDept.length > 8" class="note">图表展示前 8 个部门，完整数据见下方。</view>
        <UChart v-if="enterpriseChart" type="column" :data="enterpriseChart" :opts="countChartOptions" :height="540" />
        <EmptyState v-else text="所选区间内暂无已提交申请" />
      </view>
      <view v-for="row in enterprise.byDept" :key="row.deptId" class="panel">
        <view class="panel-title break">{{ row.deptName }}</view>
        <view class="dept-metrics">
          <view v-for="metric in totalMetrics(row)" :key="metric.label" class="dept-metric"><view class="note">{{ metric.label }}</view><view class="amount break">{{ metric.value }}</view></view>
        </view>
      </view>
      <view class="note">通过率 = 已通过 /（已通过 + 已驳回）；平均审批时长仅含已通过、已驳回申请；“—”表示没有可计算的数据。</view>
    </template>
  </view>
</template>

<style scoped>
.stats {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom));
  background: var(--eas-paper);
  color: var(--eas-ink);
  font-family: var(--eas-font-sans);
}

.definition {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 16rpx 24rpx;
  margin-bottom: 24rpx;
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-2);
  background: var(--eas-paper-deep);
  border-radius: var(--eas-radius-control);
}

.tabs {
  display: flex;
  padding: 6rpx;
  margin-bottom: 24rpx;
  background: var(--eas-paper-deep);
  border-radius: var(--eas-radius-control);
}

.tab {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 88rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
  border-radius: var(--eas-radius-control);
  transition: background-color var(--eas-dur) var(--eas-ease);
}

.tab--active {
  background: var(--eas-surface);
  color: var(--eas-ink);
  font-weight: 600;
}

.notice {
  padding: 20rpx 24rpx;
  margin-bottom: 24rpx;
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-2);
  background: var(--eas-primary-tint);
  border-radius: var(--eas-radius-control);
}

.notice--warning {
  color: var(--eas-warning-text);
  background: var(--eas-warning-tint);
}

.panel {
  padding: 24rpx 28rpx;
  margin-bottom: 24rpx;
  background: var(--eas-surface);
  border: 1rpx solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
}

.panel-title {
  margin-bottom: 12rpx;
  font-size: var(--eas-fs-sm);
  font-weight: 600;
}

.section {
  margin: 8rpx 4rpx 16rpx;
  font-size: var(--eas-fs-sm);
  font-weight: 600;
  color: var(--eas-ink-2);
}

.note {
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-3);
}

.err {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-danger);
}

.label {
  margin-bottom: 12rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}

.date-range {
  display: flex;
  align-items: center;
}

.date-picker {
  flex: 1;
  min-width: 0;
}

.date-separator {
  margin: 0 16rpx;
  color: var(--eas-ink-2);
}

.pick {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 20rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
  background: var(--eas-paper);
  border: 2rpx solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
}

.pick--between {
  justify-content: space-between;
}

.pick-action {
  flex-shrink: 0;
  margin-left: 16rpx;
  color: var(--eas-primary);
}

.shortcuts {
  display: flex;
  margin: 16rpx -8rpx 0;
}

.chip {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 88rpx;
  margin: 0 8rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-primary);
  border: 2rpx solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
}

.dept-field {
  margin-top: 24rpx;
}

.refresh-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: -8rpx 0 16rpx;
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
  color: var(--eas-primary);
  background: transparent;
  border-radius: var(--eas-radius-control);
}

.refresh-button::after {
  border: 0;
}

.metric-grid {
  display: flex;
  flex-wrap: wrap;
  margin: 0 -8rpx 8rpx;
}

.metric {
  width: calc(50% - 16rpx);
  margin: 0 8rpx 16rpx;
  padding: 24rpx 20rpx;
  background: var(--eas-surface);
  border: 1rpx solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
}

.metric-value {
  margin-top: 8rpx;
  font-size: var(--eas-fs-md);
  line-height: 1.4;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}

.metric-hint {
  margin-top: 6rpx;
  font-size: var(--eas-fs-xs);
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
  width: 12rpx;
  height: 12rpx;
  margin-right: 12rpx;
  border-radius: 50%;
}

.dot--muted {
  background: var(--eas-muted);
}

.dot--primary {
  background: var(--eas-primary);
}

.dot--success {
  background: var(--eas-success);
}

.dot--danger {
  background: var(--eas-danger);
}

.wrap-name {
  flex: 1;
  word-break: break-all;
}

.detail-item {
  padding: 20rpx 0;
  border-top: 1rpx solid var(--eas-rule);
}

.detail-item:first-child {
  border-top: 0;
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

.dept-metrics {
  display: flex;
  flex-wrap: wrap;
}

.dept-metric {
  width: 50%;
  padding: 12rpx 16rpx 12rpx 0;
}
</style>
