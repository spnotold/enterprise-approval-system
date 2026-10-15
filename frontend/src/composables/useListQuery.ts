// 列表的筛选条件、分页与 URL 查询参数同步：刷新页面后筛选不丢
import { computed, reactive, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter, type LocationQuery, type LocationQueryRaw } from 'vue-router'
import type { PageResponse } from '@/lib/types'
import { toApiError, type ApiError } from '@/lib/http'
import { showError } from '@/lib/errors'

export type FilterValue = string | number | boolean | null | undefined

export interface ListQueryOptions<F extends Record<string, FilterValue>, T> {
  /** 筛选条件默认值；键名即 URL 查询参数名 */
  defaults: F
  fetch: (q: F & { page: number; size: number }) => Promise<PageResponse<T>>
  /** 默认值为 null 但应按数字解析的键（如 deptId） */
  numberKeys?: (keyof F)[]
  pageSize?: number
  /** 是否与 URL 同步，默认 true；同一页面有多个列表时只让一个同步 */
  syncUrl?: boolean
  /** 创建后立即加载，默认 true */
  immediate?: boolean
}

function first(v: LocationQuery[string]): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return s === undefined || s === null || s === '' ? null : s
}

function isBlank(v: FilterValue): boolean {
  return v === null || v === undefined || v === ''
}

export function useListQuery<F extends Record<string, FilterValue>, T>(opts: ListQueryOptions<F, T>) {
  const route = useRoute()
  const router = useRouter()
  const syncUrl = opts.syncUrl !== false
  const defaultSize = opts.pageSize ?? 20
  const keys = Object.keys(opts.defaults) as (keyof F & string)[]
  const numberKeys = new Set<string>((opts.numberKeys ?? []).map(String))

  const filters = reactive({ ...opts.defaults }) as F
  const page = ref(1)
  const size = ref(defaultSize)
  const records = ref([]) as Ref<T[]>
  const total = ref(0)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<ApiError | null>(null)
  const ownPath = route.path

  function readQuery(q: LocationQuery) {
    for (const key of keys) {
      const raw = first(q[key])
      const def = opts.defaults[key]
      let value: FilterValue = def
      if (raw !== null) {
        if (typeof def === 'number' || numberKeys.has(key)) {
          const n = Number(raw)
          value = Number.isFinite(n) ? n : def
        } else if (typeof def === 'boolean') {
          value = raw === 'true' || raw === '1'
        } else {
          value = raw
        }
      }
      ;(filters as Record<string, FilterValue>)[key] = value
    }
    const p = Number(first(q.page))
    page.value = Number.isInteger(p) && p > 0 ? p : 1
    const s = Number(first(q.size))
    size.value = Number.isInteger(s) && s > 0 && s <= 100 ? s : defaultSize
  }

  function toQuery(): Record<string, string> {
    const q: Record<string, string> = {}
    for (const key of keys) {
      const v = filters[key]
      if (isBlank(v) || v === opts.defaults[key]) continue
      q[key] = String(v)
    }
    if (page.value > 1) q.page = String(page.value)
    if (size.value !== defaultSize) q.size = String(size.value)
    return q
  }

  /** 当前是否带有非默认的筛选条件（用于空结果时显示“清空筛选”） */
  const hasFilters = computed(() => keys.some((k) => !isBlank(filters[k]) && filters[k] !== opts.defaults[k]))

  let seq = 0
  async function load() {
    const my = ++seq
    loading.value = true
    error.value = null
    try {
      const params = { ...filters, page: page.value, size: size.value } as F & { page: number; size: number }
      // 空值不传给后端
      for (const k of keys) if (isBlank(params[k])) delete (params as Record<string, unknown>)[k]
      const r = await opts.fetch(params)
      if (my !== seq) return
      records.value = r.records
      total.value = r.total
      // 删除最后一页的最后一条后回到上一页
      if (r.records.length === 0 && page.value > 1 && r.total > 0) {
        page.value = Math.max(1, Math.ceil(r.total / size.value))
        await apply()
      }
    } catch (e) {
      if (my !== seq) return
      error.value = toApiError(e)
      records.value = []
      total.value = 0
      showError(e)
    } finally {
      if (my === seq) {
        loading.value = false
        loaded.value = true
      }
    }
  }

  function sameQuery(a: LocationQueryRaw, b: LocationQuery): boolean {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) => String(a[k]) === first(b[k]))
  }

  async function apply() {
    if (!syncUrl) return load()
    const q = toQuery()
    if (sameQuery(q, route.query)) return load()
    await router.replace({ query: q })
  }

  /** 修改筛选条件后查询：回到第 1 页 */
  function search() {
    page.value = 1
    return apply()
  }

  function reset() {
    Object.assign(filters, opts.defaults)
    page.value = 1
    return apply()
  }

  function onPageChange(p: number) {
    page.value = p
    return apply()
  }

  function onSizeChange(s: number) {
    size.value = s
    page.value = 1
    return apply()
  }

  if (syncUrl) {
    readQuery(route.query)
    watch(
      () => route.query,
      (q) => {
        if (route.path !== ownPath) return
        readQuery(q)
        void load()
      },
    )
  }
  if (opts.immediate !== false) void load()

  return {
    filters,
    page,
    size,
    records,
    total,
    loading,
    loaded,
    error,
    hasFilters,
    load,
    search,
    reset,
    onPageChange,
    onSizeChange,
  }
}

/** 日期区间筛选与 el-date-picker type="daterange" 双向绑定 */
export function dateRangeModel(filters: { from?: FilterValue; to?: FilterValue }) {
  return computed<[string, string] | null>({
    get: () => (filters.from && filters.to ? ([String(filters.from), String(filters.to)] as [string, string]) : null),
    set: (v: [string, string] | null) => {
      filters.from = v?.[0] ?? null
      filters.to = v?.[1] ?? null
    },
  })
}
