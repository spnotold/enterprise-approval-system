// 时间显示与计算统一按上海时区（UTC+8，无夏令时）处理，不依赖浏览器所在时区。

const OFFSET_MS = 8 * 3600_000
const pad = (n: number, w = 2) => String(n).padStart(w, '0')

interface Parts {
  y: number
  M: number
  d: number
  h: number
  m: number
  s: number
}

function toParts(input: string | number | Date): Parts | null {
  const t = typeof input === 'number' ? input : input instanceof Date ? input.getTime() : Date.parse(input)
  if (Number.isNaN(t)) return null
  const d = new Date(t + OFFSET_MS)
  return {
    y: d.getUTCFullYear(),
    M: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    m: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
  }
}

/** 2026-11-20 18:00 */
export function fmtDateTime(input: string | null | undefined, withSeconds = false): string {
  if (!input) return '—'
  const p = toParts(input)
  if (!p) return '—'
  const base = `${p.y}-${pad(p.M)}-${pad(p.d)} ${pad(p.h)}:${pad(p.m)}`
  return withSeconds ? `${base}:${pad(p.s)}` : base
}

/** 2026-11-20；已是 YYYY-MM-DD 的日期原样返回 */
export function fmtDate(input: string | null | undefined): string {
  if (!input) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input
  const p = toParts(input)
  return p ? `${p.y}-${pad(p.M)}-${pad(p.d)}` : '—'
}

/** 上海时区的今天，YYYY-MM-DD */
export function todayShanghai(now: number = Date.now()): string {
  const p = toParts(now)!
  return `${p.y}-${pad(p.M)}-${pad(p.d)}`
}

/** YYYY-MM-DD 加减天数 */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400_000)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** 两个 YYYY-MM-DD 之间相差的天数（b - a） */
export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400_000)
}

export function isDateString(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** 解析模板日期规则：YYYY-MM-DD、TODAY、TODAY+30、TODAY-7；无法解析返回 null */
export function resolveDateToken(token: string | null | undefined, today: string = todayShanghai()): string | null {
  if (!token) return null
  const t = token.trim().toUpperCase()
  const m = /^TODAY(?:([+-])(\d{1,4}))?$/.exec(t)
  if (m) {
    const n = m[2] ? Number(m[2]) * (m[1] === '-' ? -1 : 1) : 0
    return addDays(today, n)
  }
  return isDateString(t) ? t : null
}

// ---------- 日期时间选择器（按上海墙上时间处理） ----------
// el-date-picker 使用 value-format="YYYY-MM-DDTHH:mm:ss"，得到不带偏移的“墙上时间”，
// 一律解释为上海时间，提交时补上 +08:00，与浏览器所在时区无关。

export const WALL_FORMAT = 'YYYY-MM-DDTHH:mm:ss'

/** 服务端 ISO 时间 -> 上海墙上时间 YYYY-MM-DDTHH:mm:ss */
export function isoToShanghaiWall(iso: string | null | undefined): string | null {
  if (!iso) return null
  const p = toParts(iso)
  if (!p) return null
  return `${p.y}-${pad(p.M)}-${pad(p.d)}T${pad(p.h)}:${pad(p.m)}:${pad(p.s)}`
}

/** 上海墙上时间 -> 带偏移的 ISO 8601 */
export function shanghaiWallToIso(wall: string | null | undefined): string | null {
  if (!wall) return null
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall)
  if (!m) return null
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}+08:00`
}

function wallToEpoch(wall: string): number | null {
  const iso = shanghaiWallToIso(wall)
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export interface TravelDuration {
  naturalDays: number
  /** 保留一位小数，如 "15.0" */
  hours: string
}

/**
 * 差旅时长（与服务端 TravelService.computeDuration 一致）：
 * 自然日 = 上海时区结束日期 − 开始日期 + 1；实际时长 = 分钟数 / 60，HALF_UP 保留一位小数。
 * 结束早于开始时返回 null。
 */
export function travelDuration(startWall: string | null, endWall: string | null): TravelDuration | null {
  if (!startWall || !endWall) return null
  const s = wallToEpoch(startWall)
  const e = wallToEpoch(endWall)
  if (s === null || e === null || e < s) return null
  const naturalDays = diffDays(startWall.slice(0, 10), endWall.slice(0, 10)) + 1
  const minutes = Math.floor((e - s) / 60_000)
  const tenths = Math.floor((minutes + 3) / 6) // minutes / 6 四舍五入
  return { naturalDays, hours: `${Math.trunc(tenths / 10)}.${tenths % 10}` }
}

export function fmtTravelDuration(naturalDays: number | null | undefined, hours: string | null | undefined): string {
  if (naturalDays == null) return '—'
  return `${naturalDays} 天（自然日）/ 实际 ${hours ?? '—'} 小时`
}

/** 相对时间：刚刚、5 分钟前、3 小时前、昨天 18:00、2026-11-20 */
export function fromNow(input: string | null | undefined, now: number = Date.now()): string {
  if (!input) return '—'
  const t = Date.parse(input)
  if (Number.isNaN(t)) return '—'
  const diff = now - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  const today = todayShanghai(now)
  const day = todayShanghai(t)
  if (day === today) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diffDays(day, today) === 1) return `昨天 ${fmtDateTime(input).slice(11)}`
  return fmtDate(input)
}

/** 小时数显示：12.5 -> "12.5 小时" */
export function fmtHours(h: number | null | undefined): string {
  if (h == null) return '—'
  return `${(Math.round(h * 10) / 10).toFixed(1)} 小时`
}
