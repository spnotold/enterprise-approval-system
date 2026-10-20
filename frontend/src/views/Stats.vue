<script setup lang="ts">
// 统计：个人 / 本部门 / 财务 / 企业，按权限显示标签页；只加载当前标签页，日期区间或部门变化后重新加载
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type {
  DefaultLabelFormatterCallbackParams,
  TooltipComponentFormatterCallbackParams,
  XAXisComponentOption,
  YAXisComponentOption,
} from 'echarts'
import { api } from '@/lib/api'
import { showError } from '@/lib/errors'
import { formatCents } from '@/lib/money'
import { addDays, fmtHours, todayShanghai } from '@/lib/datetime'
import { APP_STATUS_LABEL, APP_TYPE_LABEL } from '@/lib/labels'
import { useAuthStore } from '@/stores/auth'
import { useDictStore } from '@/stores/dict'
import StatsChart from '@/components/StatsChart.vue'
import IndexTabs from '@/components/IndexTabs.vue'
import ListEmpty from '@/components/ListEmpty.vue'
import MoneyText from '@/components/MoneyText.vue'
import type { AppStatus, AppType, EnterpriseStats, FinanceStats, MonthlyRow } from '@/lib/types'

type ChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | GridComponentOption
  | XAXisComponentOption
  | YAXisComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>
type TabName = 'personal' | 'dept' | 'finance' | 'enterprise'
type EnterpriseRow = EnterpriseStats['byDept'][number]
type FinanceDeptRow = FinanceStats['byDept'][number]
interface LedgerItem {
  label: string
  value?: string
  unit?: string
  cents?: number
}

const auth = useAuthStore()
const dict = useDictStore()
const route = useRoute()
const router = useRouter()

// ---------- 配色：全部取自设计 token（docs/ui_design.md 第 2 节，frontend/src/styles/tokens.css） ----------

/** 从全局 CSS 变量读色值，避免在图表配置里写死颜色 */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const STATUS_ORDER: AppStatus[] = ['DRAFT', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN']
/** 状态分布沿用第 2 节的状态语义色；其余图表按序列使用图表配色。 */
const STATUS_COLOR: Record<AppStatus, string> = {
  DRAFT: cssVar('--eas-muted'),
  IN_APPROVAL: cssVar('--eas-primary'),
  APPROVED: cssVar('--eas-success'),
  REJECTED: cssVar('--eas-danger'),
  // 与草稿同为灰色的已撤回会和草稿在环形图上连成一片，借用图表第 6 色区分
  WITHDRAWN: cssVar('--eas-chart-6'),
}
const CHART_COLORS = Array.from({ length: 6 }, (_, i) => cssVar(`--eas-chart-${i + 1}`))
const TYPE_ORDER: AppType[] = ['PURCHASE', 'TRAVEL', 'EXPENSE', 'CUSTOM']
const AXIS_TEXT = cssVar('--eas-ink-2')
const GRID_LINE = cssVar('--eas-rule')
const SURFACE = cssVar('--eas-sheet')
const AXIS_LINE = { lineStyle: { color: GRID_LINE } }
const CHART_BASE = {
  color: CHART_COLORS,
  // 不播放装饰性入场动画，同时覆盖 prefers-reduced-motion 场景。
  animation: false,
  textStyle: { fontFamily: cssVar('--eas-font-sans'), color: AXIS_TEXT },
}
const TOOLTIP: TooltipComponentOption = {
  backgroundColor: SURFACE,
  borderColor: GRID_LINE,
  textStyle: { color: AXIS_TEXT, fontFamily: cssVar('--eas-font-sans') },
  extraCssText: 'box-shadow: none; font-variant-numeric: tabular-nums;',
  axisPointer: {
    lineStyle: { color: GRID_LINE },
    shadowStyle: { color: cssVar('--eas-tab'), opacity: 0.5 },
  },
}
const SERIES_EMPHASIS = { focus: 'series' as const }
const SERIES_BLUR = { itemStyle: { opacity: 0.2 }, lineStyle: { opacity: 0.2 } }

// ---------- 日期区间（上海时区） ----------

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 往前数 monthsBack 个月的 1 日 */
function monthStart(today: string, monthsBack: number): string {
  const [y, m] = today.split('-').map(Number)
  const idx = y * 12 + (m - 1) - monthsBack
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}-01`
}

function defaultRange(): [string, string] {
  const today = todayShanghai()
  return [monthStart(today, 5), today]
}

/** 日期选择器的快捷项需要 Date：按浏览器本地零点构造，格式化后正好是该日期 */
function toLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function shortcut(text: string, from: (today: string) => string) {
  return {
    text,
    value: () => {
      const today = todayShanghai()
      return [toLocalDate(from(today)), toLocalDate(today)]
    },
  }
}
const shortcuts = [
  shortcut('本月', (t) => addDays(t, 1 - Number(t.slice(8, 10)))),
  shortcut('近 3 个月', (t) => monthStart(t, 2)),
  shortcut('近 6 个月', (t) => monthStart(t, 5)),
  shortcut('今年', (t) => `${t.slice(0, 4)}-01-01`),
]
const disabledDate = (d: Date) => localYmd(d) > todayShanghai()

const range = ref<[string, string]>(defaultRange())

// ---------- 标签页 ----------

const TAB_DEFS: { name: TabName; label: string; perm?: string }[] = [
  { name: 'personal', label: '个人' },
  { name: 'dept', label: '本部门', perm: 'STATS_DEPT' },
  { name: 'finance', label: '财务', perm: 'FIN_STATS' },
  { name: 'enterprise', label: '全企业', perm: 'ENTERPRISE_STATS' },
]
const tabs = computed(() => TAB_DEFS.filter((t) => !t.perm || auth.can(t.perm)))
const tabItems = computed(() => tabs.value.map((t) => ({ key: t.name, label: t.label })))
const initialTab = tabs.value.find((t) => t.name === route.query.tab)?.name ?? 'personal'
const active = ref<string>(initialTab)

function onSelect(key: string) {
  active.value = key
}

watch(active, (t) => {
  void router.replace({ query: { ...route.query, tab: t === 'personal' ? undefined : t } })
})

// ---------- 本部门：负责多个部门时可切换 ----------

const headDeptIds = computed(() => auth.me?.headDeptIds ?? [])
const multiDept = computed(() => headDeptIds.value.length > 1)
function defaultDept(): number | null {
  const ids = headDeptIds.value
  if (!ids.length) return null
  const own = auth.me?.deptId
  return own != null && ids.includes(own) ? own : ids[0]
}
const deptId = ref<number | null>(defaultDept())
const deptOptions = computed(() => headDeptIds.value.map((id) => ({ id, name: dict.deptName(id) })))

// ---------- 数据加载：每个标签页独立，按 key 判断是否需要重新请求 ----------

function useStats<T>(fetch: () => Promise<T>, keyOf: () => string) {
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  let loadedKey: string | null = null
  let seq = 0
  async function ensure(force = false) {
    const key = keyOf()
    if (!force && key === loadedKey) return
    loadedKey = key
    const my = ++seq
    loading.value = true
    failed.value = false
    try {
      const r = await fetch()
      if (my === seq) data.value = r
    } catch (e) {
      if (my !== seq) return
      loadedKey = null
      data.value = null
      failed.value = true
      showError(e, '统计数据加载失败')
    } finally {
      if (my === seq) loading.value = false
    }
  }
  return { data, loading, failed, ensure }
}

const rangeKey = () => range.value.join('~')
const personal = useStats(
  () => api.stats.personal(),
  () => 'personal',
)
const dept = useStats(
  () =>
    api.stats.dept({
      from: range.value[0],
      to: range.value[1],
      deptId: multiDept.value ? deptId.value : undefined,
    }),
  () => `${rangeKey()}|${multiDept.value ? deptId.value : ''}`,
)
const finance = useStats(
  () => api.stats.finance({ from: range.value[0], to: range.value[1] }),
  rangeKey,
)
const enterprise = useStats(
  () => api.stats.enterprise({ from: range.value[0], to: range.value[1] }),
  rangeKey,
)
const states: Record<TabName, { loading: { value: boolean }; ensure: (force?: boolean) => Promise<void> }> = {
  personal,
  dept,
  finance,
  enterprise,
}
const activeState = () => states[active.value as TabName] as (typeof states)[TabName] | undefined

watch([active, range, deptId], () => void activeState()?.ensure(), { immediate: true })

const refreshing = computed(() => activeState()?.loading.value ?? false)
function refresh() {
  void activeState()?.ensure(true)
}

onMounted(() => {
  if (multiDept.value) dict.loadDepartments().catch(() => undefined) // 只用于部门名称显示
})

// ---------- 格式化 ----------

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** ECharts 的 tooltip 以 HTML 渲染，部门名、费用类型名等文本必须转义 */
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c])
const pct = (r: number | null | undefined) => (r == null ? '—' : `${(r * 100).toFixed(1)}%`)
/** 仅用于坐标轴刻度（元） */
const yuanAxis = (v: number) => (Math.abs(v) >= 10000 ? `${Number((v / 10000).toFixed(1))}万` : String(v))

function paramList(p: TooltipComponentFormatterCallbackParams) {
  return Array.isArray(p) ? p : [p]
}
function markerOf(p: { marker?: unknown }): string {
  return typeof p.marker === 'string' ? p.marker : ''
}

/** 坐标轴触发的计数类 tooltip：标题 + 各系列数值 */
function countTooltip(withTotal: boolean) {
  return (params: TooltipComponentFormatterCallbackParams) => {
    const list = paramList(params)
    if (!list.length) return ''
    const lines = list.map((p) => `${markerOf(p)}${esc(p.seriesName)}：<b>${esc(p.value ?? 0)}</b> 单`)
    if (withTotal) {
      const total = list.reduce((s, p) => s + (typeof p.value === 'number' ? p.value : 0), 0)
      lines.push(`合计：<b>${total}</b> 单`)
    }
    return [`<b>${esc(list[0].name)}</b>`, ...lines].join('<br/>')
  }
}

function pieTooltip(params: TooltipComponentFormatterCallbackParams) {
  const p = paramList(params)[0]
  if (!p) return ''
  return `${markerOf(p)}${esc(p.name)}：<b>${esc(p.value)}</b> 单（${esc(p.percent)}%）`
}

const LEGEND: LegendComponentOption = {
  top: 0,
  icon: 'roundRect',
  itemWidth: 12,
  itemHeight: 8,
  textStyle: { color: AXIS_TEXT },
  inactiveColor: cssVar('--eas-ink-3'),
  inactiveBorderColor: GRID_LINE,
}

function statusPie(counts: Partial<Record<AppStatus, number>>): ChartOption | null {
  const data = STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => ({
    name: APP_STATUS_LABEL[s],
    value: counts[s] ?? 0,
    itemStyle: { color: STATUS_COLOR[s] },
  }))
  if (!data.length) return null
  return {
    ...CHART_BASE,
    tooltip: { ...TOOLTIP, trigger: 'item', formatter: pieTooltip },
    legend: { ...LEGEND, top: undefined, bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        itemStyle: { borderColor: SURFACE, borderWidth: 2, borderRadius: 4 },
        emphasis: SERIES_EMPHASIS,
        blur: SERIES_BLUR,
        label: { formatter: '{b} {c}', color: AXIS_TEXT },
        data,
      },
    ],
  }
}

// ---------- 个人 ----------

const personalPie = computed(() => (personal.data.value ? statusPie(personal.data.value.statusCounts) : null))

// ---------- 本部门 ----------

const deptLedger = computed<LedgerItem[]>(() => {
  const t = dept.data.value?.totals
  if (!t) return []
  return [
    { label: '申请数', value: `${t.count}`, unit: '单' },
    { label: '已通过金额', cents: t.approvedAmountCents },
    { label: '通过率', value: pct(t.approvalRate) },
    { label: '平均审批时长', value: fmtHours(t.avgApprovalHours) },
  ]
})

/** 账单行下的一行注解：部门、区间，以及在途金额的口径 */
const deptNote = computed(() => {
  const d = dept.data.value
  if (!d) return ''
  const parts = [`${d.deptName}，${d.from} 至 ${d.to}`]
  if (d.totals.inProgressAmountCents > 0) {
    parts.push(`在途金额 ¥${formatCents(d.totals.inProgressAmountCents)} 为审批中申请的金额`)
  }
  return parts.join('；')
})

const deptStatusCounts = computed(() => {
  const counts: Partial<Record<AppStatus, number>> = {}
  for (const r of dept.data.value?.byTypeStatus ?? []) counts[r.status] = (counts[r.status] ?? 0) + r.count
  return counts
})

const deptTypeBar = computed<ChartOption | null>(() => {
  const rows = dept.data.value?.byTypeStatus ?? []
  if (!rows.some((r) => r.count > 0)) return null
  const types = TYPE_ORDER.filter((t) => rows.some((r) => r.type === t))
  const statuses = STATUS_ORDER.filter((s) => rows.some((r) => r.status === s && r.count > 0))
  const countOf = (t: AppType, s: AppStatus) =>
    rows.filter((r) => r.type === t && r.status === s).reduce((n, r) => n + r.count, 0)
  return {
    ...CHART_BASE,
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { ...TOOLTIP.axisPointer, type: 'shadow' },
      formatter: countTooltip(true),
    },
    legend: LEGEND,
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: types.map((t) => APP_TYPE_LABEL[t]),
      axisLine: AXIS_LINE,
      axisLabel: { color: AXIS_TEXT },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: AXIS_LINE,
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: statuses.map((s) => ({
      name: APP_STATUS_LABEL[s],
      type: 'bar' as const,
      stack: 'total',
      barMaxWidth: 48,
      emphasis: { ...SERIES_EMPHASIS, itemStyle: { borderColor: STATUS_COLOR[s], borderWidth: 2 } },
      blur: SERIES_BLUR,
      itemStyle: { color: STATUS_COLOR[s], borderColor: SURFACE, borderWidth: 1 },
      data: types.map((t) => countOf(t, s)),
    })),
  }
})

const deptStatusPie = computed(() => statusPie(deptStatusCounts.value))

function monthsBetween(from: string, to: string): string[] {
  const a = /^(\d{4})-(\d{2})/.exec(from)
  const b = /^(\d{4})-(\d{2})/.exec(to)
  if (!a || !b) return []
  const out: string[] = []
  const end = Number(b[1]) * 12 + Number(b[2]) - 1
  for (let i = Number(a[1]) * 12 + Number(a[2]) - 1; i <= end && out.length < 240; i++) {
    out.push(`${Math.floor(i / 12)}-${pad2((i % 12) + 1)}`)
  }
  return out
}

/** 区间内每个月一行，没有数据的月份补 0 */
const deptMonthly = computed<MonthlyRow[]>(() => {
  const d = dept.data.value
  if (!d) return []
  const byMonth = new Map(d.monthly.map((r) => [r.month, r]))
  const months = new Set([...monthsBetween(d.from, d.to), ...byMonth.keys()])
  return [...months]
    .sort()
    .map((m) => byMonth.get(m) ?? { month: m, count: 0, approvedAmountCents: 0 })
})

const deptMonthlyLine = computed<ChartOption | null>(() => {
  const rows = deptMonthly.value
  if (!rows.some((r) => r.count > 0 || r.approvedAmountCents > 0)) return null
  return {
    ...CHART_BASE,
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const list = paramList(params)
        const r = rows[list[0]?.dataIndex ?? -1]
        if (!r) return ''
        const m0 = markerOf(list.find((p) => p.seriesIndex === 0) ?? {})
        const m1 = markerOf(list.find((p) => p.seriesIndex === 1) ?? {})
        return [
          `<b>${esc(r.month)}</b>`,
          `${m0}申请数：<b>${r.count}</b> 单`,
          `${m1}已通过金额：<b>¥${formatCents(r.approvedAmountCents)}</b>`,
        ].join('<br/>')
      },
    },
    legend: LEGEND,
    grid: { left: 8, right: 8, top: 48, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.month),
      axisLine: AXIS_LINE,
      axisLabel: { color: AXIS_TEXT },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: '申请数（单）',
        minInterval: 1,
        nameTextStyle: { color: AXIS_TEXT },
        axisLine: AXIS_LINE,
        axisLabel: { color: AXIS_TEXT },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      {
        type: 'value',
        name: '已通过金额（元）',
        nameTextStyle: { color: AXIS_TEXT },
        axisLine: AXIS_LINE,
        axisLabel: { color: AXIS_TEXT, formatter: yuanAxis },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '申请数',
        type: 'line',
        yAxisIndex: 0,
        symbolSize: 8,
        lineStyle: { width: 2 },
        itemStyle: { color: CHART_COLORS[0] },
        emphasis: SERIES_EMPHASIS,
        blur: SERIES_BLUR,
        data: rows.map((r) => r.count),
      },
      {
        name: '已通过金额',
        type: 'line',
        yAxisIndex: 1,
        symbolSize: 8,
        lineStyle: { width: 2 },
        itemStyle: { color: CHART_COLORS[1] },
        emphasis: SERIES_EMPHASIS,
        blur: SERIES_BLUR,
        // 仅用于绘图：分转元
        data: rows.map((r) => r.approvedAmountCents / 100),
      },
    ],
  }
})

// ---------- 财务 ----------

/** 报销 / 采购已通过金额合计，与明细表合计行口径一致 */
const financeTotals = computed(() => {
  const rows = finance.data.value?.byDept ?? []
  const sum = (k: 'expenseAmountCents' | 'purchaseAmountCents') => rows.reduce((s, r) => s + r[k], 0)
  return { expenseCents: sum('expenseAmountCents'), purchaseCents: sum('purchaseAmountCents') }
})

const financeLedger = computed<LedgerItem[]>(() => {
  const d = finance.data.value
  if (!d) return []
  return [
    { label: '报销已通过金额', cents: financeTotals.value.expenseCents },
    { label: '采购已通过金额', cents: financeTotals.value.purchaseCents },
    { label: '无票金额', cents: d.noInvoice.amountCents },
    { label: '无票金额占比', value: pct(d.noInvoice.ratio) },
  ]
})

const financeNote = computed(() => {
  const d = finance.data.value
  if (!d) return ''
  return `${d.from} 至 ${d.to}；无票明细 ${d.noInvoice.count} 条`
})

const financeTypes = computed(() =>
  // 类目轴自下而上排列，升序排序后金额最大的在最上方
  [...(finance.data.value?.byExpenseType ?? [])].sort((a, b) => a.approvedAmountCents - b.approvedAmountCents),
)
const financeBarHeight = computed(() => Math.max(240, financeTypes.value.length * 40 + 40))
const financeBar = computed<ChartOption | null>(() => {
  const rows = financeTypes.value
  if (!rows.some((r) => r.approvedAmountCents > 0 || r.itemCount > 0)) return null
  return {
    ...CHART_BASE,
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { ...TOOLTIP.axisPointer, type: 'shadow' },
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const r = rows[paramList(params)[0]?.dataIndex ?? -1]
        if (!r) return ''
        return [
          `<b>${esc(r.name)}</b>`,
          `已通过金额：<b>¥${formatCents(r.approvedAmountCents)}</b>`,
          `明细数：<b>${r.itemCount}</b> 条`,
        ].join('<br/>')
      },
    },
    grid: { left: 8, right: 110, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLine: AXIS_LINE,
      axisLabel: { color: AXIS_TEXT, formatter: yuanAxis },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.name),
      axisLine: AXIS_LINE,
      axisLabel: { color: AXIS_TEXT },
      axisTick: { show: false },
    },
    series: [
      {
        name: '已通过金额',
        type: 'bar',
        barMaxWidth: 24,
        itemStyle: { color: CHART_COLORS[0], borderRadius: [0, 4, 4, 0] },
        emphasis: { ...SERIES_EMPHASIS, itemStyle: { borderColor: CHART_COLORS[0], borderWidth: 2 } },
        blur: SERIES_BLUR,
        label: {
          show: true,
          position: 'right',
          color: AXIS_TEXT,
          formatter: (p: DefaultLabelFormatterCallbackParams) =>
            `¥${formatCents(rows[p.dataIndex]?.approvedAmountCents ?? 0)}`,
        },
        // 仅用于绘图：分转元
        data: rows.map((r) => r.approvedAmountCents / 100),
      },
    ],
  }
})

function financeSummary(p: { data: FinanceDeptRow[] }): string[] {
  const sum = (k: 'expenseAmountCents' | 'purchaseAmountCents') => p.data.reduce((s, r) => s + r[k], 0)
  return ['合计', `¥${formatCents(sum('expenseAmountCents'))}`, `¥${formatCents(sum('purchaseAmountCents'))}`]
}

// ---------- 企业 ----------

/** 全企业账单行：各部门合计 */
const enterpriseTotals = computed(() => {
  const rows = enterprise.data.value?.byDept ?? []
  return {
    count: rows.reduce((s, r) => s + r.count, 0),
    approvedCount: rows.reduce((s, r) => s + r.approvedCount, 0),
    rejectedCount: rows.reduce((s, r) => s + r.rejectedCount, 0),
    approvedAmountCents: rows.reduce((s, r) => s + r.approvedAmountCents, 0),
  }
})

const enterpriseLedger = computed<LedgerItem[]>(() => {
  if (!enterprise.data.value) return []
  const t = enterpriseTotals.value
  return [
    { label: '申请数', value: `${t.count}`, unit: '单' },
    { label: '已通过', value: `${t.approvedCount}`, unit: '单' },
    { label: '已驳回', value: `${t.rejectedCount}`, unit: '单' },
    { label: '已通过金额', cents: t.approvedAmountCents },
  ]
})

const enterpriseBar = computed<ChartOption | null>(() => {
  const rows = enterprise.data.value?.byDept ?? []
  if (!rows.length) return null
  const series: { name: string; key: 'count' | 'approvedCount' | 'rejectedCount' }[] = [
    { name: '申请数', key: 'count' },
    { name: '已通过', key: 'approvedCount' },
    { name: '已驳回', key: 'rejectedCount' },
  ]
  return {
    ...CHART_BASE,
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { ...TOOLTIP.axisPointer, type: 'shadow' },
      formatter: countTooltip(false),
    },
    legend: LEGEND,
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.deptName),
      axisLine: AXIS_LINE,
      axisLabel: { color: AXIS_TEXT, interval: 0, rotate: rows.length > 5 ? 30 : 0 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: AXIS_LINE,
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'bar' as const,
      barMaxWidth: 28,
      barGap: '10%',
      itemStyle: { color: CHART_COLORS[i], borderRadius: [4, 4, 0, 0] },
      emphasis: { ...SERIES_EMPHASIS, itemStyle: { borderColor: CHART_COLORS[i], borderWidth: 2 } },
      blur: SERIES_BLUR,
      data: rows.map((r) => r[s.key]),
    })),
  }
})

const nullLast = (k: 'approvalRate' | 'avgApprovalHours') => (a: EnterpriseRow, b: EnterpriseRow) =>
  (a[k] ?? -1) - (b[k] ?? -1)
</script>

<template>
  <div class="page stats-page">
    <IndexTabs class="stats-tabs" :items="tabItems" :active="active" label="统计范围" @select="onSelect">
      <template #actions>
        <div class="stats-actions">
          <el-select
            v-if="active === 'dept' && multiDept"
            v-model="deptId"
            aria-label="统计部门"
            class="dept-select"
          >
            <el-option v-for="d in deptOptions" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
          <el-date-picker
            v-model="range"
            type="daterange"
            value-format="YYYY-MM-DD"
            format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            unlink-panels
            :clearable="false"
            :editable="false"
            :shortcuts="shortcuts"
            :disabled-date="disabledDate"
            class="range-picker"
          />
          <el-button :icon="Refresh" :loading="refreshing" @click="refresh">刷新</el-button>
        </div>
      </template>
    </IndexTabs>

    <!-- 个人 -->
    <section v-if="active === 'personal'" v-loading="personal.loading.value && !!personal.data.value" class="tab-body">
      <div v-if="personal.loading.value && !personal.data.value" class="sheet skeleton-sheet">
        <el-skeleton :rows="5" animated />
      </div>
      <div v-else-if="personal.failed.value" class="sheet">
        <ListEmpty description="统计数据加载失败">
          <template #action>
            <el-button type="primary" @click="personal.ensure(true)">重试</el-button>
          </template>
        </ListEmpty>
      </div>
      <template v-else-if="personal.data.value">
        <div class="sheet ledger-sheet">
          <div class="ledger">
            <router-link v-if="auth.can('TASK_HANDLE')" to="/tasks/pending" class="ledger-item ledger-link">
              <span class="ledger-label">我的待办</span>
              <span class="ledger-value">{{ personal.data.value.pendingTaskCount }}<span class="ledger-unit">件</span></span>
            </router-link>
            <div v-else class="ledger-item">
              <span class="ledger-label">我的待办</span>
              <span class="ledger-value">{{ personal.data.value.pendingTaskCount }}<span class="ledger-unit">件</span></span>
            </div>
            <div class="ledger-item">
              <span class="ledger-label">已通过申请</span>
              <span class="ledger-value">{{ personal.data.value.approvedCount }}<span class="ledger-unit">单</span></span>
            </div>
            <div class="ledger-item">
              <span class="ledger-label">已通过金额</span>
              <span class="ledger-value"><MoneyText :cents="personal.data.value.approvedAmountCents" /></span>
            </div>
          </div>
          <p class="ledger-note">个人统计为全部时间的数据</p>
        </div>
        <section class="sheet chart-sheet">
          <div class="sheet-head"><h2>我的申请状态分布</h2></div>
          <div class="chart-body">
            <StatsChart v-if="personalPie" :option="personalPie" :height="320" />
            <ListEmpty v-else description="还没有申请">
              <template #action>
                <el-button v-if="auth.can('APP_CREATE')" type="primary" @click="router.push('/apply')">填写申请</el-button>
              </template>
            </ListEmpty>
          </div>
        </section>
      </template>
    </section>

    <!-- 本部门 -->
    <section v-else-if="active === 'dept'" v-loading="dept.loading.value && !!dept.data.value" class="tab-body">
      <div v-if="dept.loading.value && !dept.data.value" class="sheet skeleton-sheet">
        <el-skeleton :rows="8" animated />
      </div>
      <div v-else-if="dept.failed.value" class="sheet">
        <ListEmpty description="统计数据加载失败">
          <template #action>
            <el-button type="primary" @click="dept.ensure(true)">重试</el-button>
          </template>
        </ListEmpty>
      </div>
      <template v-else-if="dept.data.value">
        <div class="sheet ledger-sheet">
          <div class="ledger">
            <div v-for="item in deptLedger" :key="item.label" class="ledger-item">
              <span class="ledger-label">{{ item.label }}</span>
              <span class="ledger-value">
                <MoneyText v-if="item.cents !== undefined" :cents="item.cents" />
                <template v-else>{{ item.value }}<span v-if="item.unit" class="ledger-unit">{{ item.unit }}</span></template>
              </span>
            </div>
          </div>
          <p class="ledger-note">{{ deptNote }}</p>
        </div>
        <div v-if="dept.data.value.totals.count === 0" class="sheet">
          <ListEmpty description="所选区间内，本部门没有已提交的申请" />
        </div>
        <template v-else>
          <div class="chart-grid">
            <section class="sheet chart-sheet">
              <div class="sheet-head"><h2>各类型申请数量（按状态堆叠）</h2></div>
              <div class="chart-body">
                <StatsChart v-if="deptTypeBar" :option="deptTypeBar" :height="320" />
              </div>
            </section>
            <section class="sheet chart-sheet">
              <div class="sheet-head"><h2>状态分布</h2></div>
              <div class="chart-body">
                <StatsChart v-if="deptStatusPie" :option="deptStatusPie" :height="320" />
              </div>
            </section>
          </div>
          <section class="sheet chart-sheet">
            <div class="sheet-head"><h2>月度趋势（按提交月份）</h2></div>
            <div class="chart-body">
              <StatsChart v-if="deptMonthlyLine" :option="deptMonthlyLine" :height="320" />
            </div>
          </section>
        </template>
      </template>
    </section>

    <!-- 财务 -->
    <section v-else-if="active === 'finance'" v-loading="finance.loading.value && !!finance.data.value" class="tab-body">
      <div v-if="finance.loading.value && !finance.data.value" class="sheet skeleton-sheet">
        <el-skeleton :rows="8" animated />
      </div>
      <div v-else-if="finance.failed.value" class="sheet">
        <ListEmpty description="统计数据加载失败">
          <template #action>
            <el-button type="primary" @click="finance.ensure(true)">重试</el-button>
          </template>
        </ListEmpty>
      </div>
      <template v-else-if="finance.data.value">
        <div class="sheet ledger-sheet">
          <div class="ledger">
            <div v-for="item in financeLedger" :key="item.label" class="ledger-item">
              <span class="ledger-label">{{ item.label }}</span>
              <span class="ledger-value">
                <MoneyText v-if="item.cents !== undefined" :cents="item.cents" />
                <template v-else>{{ item.value }}<span v-if="item.unit" class="ledger-unit">{{ item.unit }}</span></template>
              </span>
            </div>
          </div>
          <p class="ledger-note">{{ financeNote }}</p>
        </div>
        <section class="sheet chart-sheet">
          <div class="sheet-head"><h2>按费用类型的报销已通过金额</h2></div>
          <div class="chart-body">
            <StatsChart v-if="financeBar" :option="financeBar" :height="financeBarHeight" />
            <ListEmpty v-else description="所选区间内没有已通过的报销" />
          </div>
        </section>
        <section class="sheet chart-sheet">
          <div class="sheet-head"><h2>各部门报销与采购已通过金额</h2></div>
          <el-table
            :data="finance.data.value.byDept"
            show-summary
            :summary-method="financeSummary"
            empty-text="暂无数据"
            class="full"
          >
            <el-table-column prop="deptName" label="部门" min-width="120" />
            <el-table-column label="报销已通过金额" min-width="150" align="right" sortable :sort-by="'expenseAmountCents'">
              <template #default="{ row }"><MoneyText :cents="row.expenseAmountCents" /></template>
            </el-table-column>
            <el-table-column label="采购已通过金额" min-width="150" align="right" sortable :sort-by="'purchaseAmountCents'">
              <template #default="{ row }"><MoneyText :cents="row.purchaseAmountCents" /></template>
            </el-table-column>
          </el-table>
        </section>
      </template>
    </section>

    <!-- 全企业 -->
    <section
      v-else-if="active === 'enterprise'"
      v-loading="enterprise.loading.value && !!enterprise.data.value"
      class="tab-body"
    >
      <div v-if="enterprise.loading.value && !enterprise.data.value" class="sheet skeleton-sheet">
        <el-skeleton :rows="8" animated />
      </div>
      <div v-else-if="enterprise.failed.value" class="sheet">
        <ListEmpty description="统计数据加载失败">
          <template #action>
            <el-button type="primary" @click="enterprise.ensure(true)">重试</el-button>
          </template>
        </ListEmpty>
      </div>
      <template v-else-if="enterprise.data.value">
        <div v-if="!enterprise.data.value.byDept.length" class="sheet">
          <ListEmpty description="所选区间内没有已提交的申请" />
        </div>
        <template v-else>
          <div class="sheet ledger-sheet">
            <div class="ledger">
              <div v-for="item in enterpriseLedger" :key="item.label" class="ledger-item">
                <span class="ledger-label">{{ item.label }}</span>
                <span class="ledger-value">
                  <MoneyText v-if="item.cents !== undefined" :cents="item.cents" />
                  <template v-else>{{ item.value }}<span v-if="item.unit" class="ledger-unit">{{ item.unit }}</span></template>
                </span>
              </div>
            </div>
            <p class="ledger-note">{{ enterprise.data.value.from }} 至 {{ enterprise.data.value.to }}</p>
          </div>
          <section class="sheet chart-sheet">
            <div class="sheet-head"><h2>各部门申请数量对比</h2></div>
            <div class="chart-body">
              <StatsChart v-if="enterpriseBar" :option="enterpriseBar" :height="340" />
            </div>
          </section>
          <section class="sheet chart-sheet">
            <div class="sheet-head"><h2>各部门明细</h2></div>
            <el-table :data="enterprise.data.value.byDept" class="full">
              <el-table-column prop="deptName" label="部门" min-width="110" />
              <el-table-column prop="count" label="申请数" min-width="90" align="right" sortable />
              <el-table-column prop="approvedCount" label="已通过" min-width="90" align="right" sortable />
              <el-table-column prop="rejectedCount" label="已驳回" min-width="90" align="right" sortable />
              <el-table-column prop="inApprovalCount" label="审批中" min-width="90" align="right" sortable />
              <el-table-column
                label="已通过金额"
                min-width="140"
                align="right"
                sortable
                :sort-by="'approvedAmountCents'"
              >
                <template #default="{ row }"><MoneyText :cents="row.approvedAmountCents" /></template>
              </el-table-column>
              <el-table-column
                label="在途金额"
                min-width="140"
                align="right"
                sortable
                :sort-by="'inProgressAmountCents'"
              >
                <template #default="{ row }"><MoneyText :cents="row.inProgressAmountCents" /></template>
              </el-table-column>
              <el-table-column
                label="通过率"
                min-width="100"
                align="right"
                sortable
                :sort-method="nullLast('approvalRate')"
              >
                <template #default="{ row }">{{ pct(row.approvalRate) }}</template>
              </el-table-column>
              <el-table-column
                label="平均审批时长"
                min-width="130"
                align="right"
                sortable
                :sort-method="nullLast('avgApprovalHours')"
              >
                <template #default="{ row }">{{ fmtHours(row.avgApprovalHours) }}</template>
              </el-table-column>
            </el-table>
          </section>
        </template>
      </template>
    </section>
  </div>
</template>

<style scoped>
.stats-page {
  gap: 0;
  font-variant-numeric: tabular-nums;
}
.stats-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.dept-select {
  width: 160px;
}
.stats-actions .range-picker {
  width: 260px;
  max-width: 100%;
}
.tab-body {
  display: flex;
  flex-direction: column;
  gap: var(--eas-gap);
  min-height: 200px;
}
/* 第一张单据与选中的页签连成一片 */
.tab-body > .sheet:first-child {
  border-top-left-radius: 0;
}
.skeleton-sheet {
  padding: var(--eas-sheet-pad);
}
.full {
  width: 100%;
}

/* 账单行：指标横排，之间 1px 竖线 */
.ledger-sheet {
  padding: 20px var(--eas-sheet-pad) 14px;
}
.ledger {
  display: flex;
}
.ledger-item {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 24px;
  color: inherit;
  text-decoration: none;
  border-radius: var(--eas-radius-control);
}
.ledger-item:first-child {
  padding-left: 0;
}
.ledger-item:last-child {
  padding-right: 0;
}
.ledger-item + .ledger-item {
  border-left: 1px solid var(--eas-rule);
}
.ledger-link:hover .ledger-value {
  color: var(--eas-primary);
}
.ledger-label {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}
.ledger-value {
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-32);
  line-height: var(--eas-lh-title);
  font-variant-numeric: tabular-nums;
  color: var(--eas-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ledger-unit {
  margin-left: 6px;
  font-family: var(--eas-font-sans);
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}
.ledger-note {
  margin: 14px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--eas-rule);
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}

/* 图表单据 */
.chart-body {
  padding: 8px 16px 16px;
}
.chart-grid {
  display: grid;
  grid-template-columns: 7fr 5fr;
  gap: var(--eas-gap);
}
@media (max-width: 1100px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}

/* 窄屏：操作区换到页签上一行右对齐，页签仍与单据相接 */
@media (max-width: 767px) {
  .stats-tabs :deep(.index-tabs-row) {
    flex-direction: column;
    align-items: stretch;
    gap: 0;
  }
  .stats-tabs :deep(.index-tab-actions) {
    order: -1;
    align-self: flex-end;
    max-width: 100%;
    padding-bottom: 10px;
  }
  .dept-select {
    width: 140px;
  }
  .stats-actions .range-picker {
    width: 230px;
  }
}

/* 账单行窄屏两列 */
@media (max-width: 700px) {
  .ledger {
    display: grid;
    grid-template-columns: 1fr 1fr;
    row-gap: 16px;
  }
  .ledger-item,
  .ledger-item:first-child,
  .ledger-item:last-child {
    padding: 4px 0;
  }
  .ledger-item + .ledger-item {
    border-left: 0;
  }
  .ledger-item:nth-child(2n) {
    border-left: 1px solid var(--eas-rule);
    padding-left: 16px;
  }
  .ledger-value {
    font-size: var(--eas-fs-26);
  }
}
</style>
