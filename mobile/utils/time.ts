// 时间工具：界面一律按上海时区（UTC+8，无夏令时）显示与计算，与手机本地时区无关。
// 服务端时间为带偏移的 ISO 8601 字符串；日期为 YYYY-MM-DD。

const CN_OFFSET_MS = 8 * 3600 * 1000
const DAY_MS = 24 * 3600 * 1000

const pad = (n: number) => String(n).padStart(2, '0')

/** 解析 ISO 字符串为毫秒；兼容 iOS 不认的 “YYYY-MM-DD HH:mm:ss” 写法 */
export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  let s = iso.trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T')
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

function cnParts(ms: number) {
  const d = new Date(ms + CN_OFFSET_MS)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
  }
}

/** 2026-11-20 18:00 */
export function fmtDateTime(iso: string | null | undefined): string {
  const t = parseTime(iso)
  if (t === null) return '—'
  const p = cnParts(t)
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}`
}

/** 2026-11-20 */
export function fmtDate(iso: string | null | undefined): string {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const t = parseTime(iso)
  if (t === null) return '—'
  const p = cnParts(t)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

/** 列表用的短格式：今年的显示 11-20 18:00，往年显示 2025-11-20 */
export function fmtShort(iso: string | null | undefined): string {
  const t = parseTime(iso)
  if (t === null) return '—'
  const p = cnParts(t)
  const now = cnParts(Date.now())
  if (p.y !== now.y) return `${p.y}-${pad(p.m)}-${pad(p.d)}`
  return `${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}`
}

/** 上海时区的今天，YYYY-MM-DD */
export function todayCN(): string {
  const p = cnParts(Date.now())
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

/** YYYY-MM-DD 加减天数 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * DAY_MS
  const r = new Date(t)
  return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`
}

/** 比较两个 YYYY-MM-DD（字典序即时间序） */
export function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 选择器的日期 + 时间（上海时区）转为 ISO 字符串 */
export function cnToIso(date: string, time: string): string {
  return `${date}T${time}:00+08:00`
}

/** ISO 字符串拆成上海时区的日期与时间，供选择器回显 */
export function isoToCn(iso: string | null | undefined): { date: string; time: string } {
  const t = parseTime(iso)
  if (t === null) return { date: '', time: '' }
  const p = cnParts(t)
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` }
}

/** 自然日天数：上海时区的结束日期 − 开始日期 + 1（与服务端 TravelService 一致） */
export function naturalDays(startIso: string | null, endIso: string | null): number | null {
  const s = parseTime(startIso)
  const e = parseTime(endIso)
  if (s === null || e === null) return null
  const ds = Math.floor((s + CN_OFFSET_MS) / DAY_MS)
  const de = Math.floor((e + CN_OFFSET_MS) / DAY_MS)
  return de - ds + 1
}

/**
 * 实际时长，单位为 0.1 小时的整数（如 150 表示 15.0 小时）。
 * 服务端：分钟数 ÷ 60 保留 1 位小数 HALF_UP，等价于 分钟数 ÷ 6 四舍五入取整。
 */
export function durationTenths(startIso: string | null, endIso: string | null): number | null {
  const s = parseTime(startIso)
  const e = parseTime(endIso)
  if (s === null || e === null || e < s) return null
  const minutes = Math.floor((e - s) / 60000)
  return Math.floor((minutes + 3) / 6)
}

export function fmtTenths(tenths: number): string {
  return `${Math.floor(tenths / 10)}.${tenths % 10}`
}

/**
 * 解析模板中的日期表达式：YYYY-MM-DD、TODAY、TODAY+30、TODAY-7
 */
export function resolveDateExpr(expr: string | null | undefined): string | null {
  if (!expr) return null
  const s = expr.trim().toUpperCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = /^TODAY(?:([+-])(\d{1,4}))?$/.exec(s)
  if (!m) return null
  const n = m[2] ? Number(m[2]) * (m[1] === '-' ? -1 : 1) : 0
  return addDays(todayCN(), n)
}
