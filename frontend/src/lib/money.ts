// 元与分的转换，全部按字符串处理，不经过 parseFloat，避免 0.1 + 0.2 这类浮点误差。
// 移动端 mobile/lib/money.ts 由 scripts/sync-lib 原样复制。

/** 单条金额上限：10 万元 */
export const MAX_ITEM_CENTS = 10_000_000

// "12.3" -> 1230，"12.30" -> 1230，"0.1" -> 10；非法输入返回 null
export function yuanToCents(input: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!m) return null
  const frac = (m[2] ?? '').padEnd(2, '0')
  return Number(m[1]) * 100 + Number(frac)
}

// 1230 -> "12.30"，-5 -> "-0.05"
export function centsToYuan(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const yuan = Math.trunc(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${yuan}.${frac}`
}

// 1234567 -> "12,345.67"
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  const [int, frac] = centsToYuan(cents).split('.')
  const neg = int.startsWith('-')
  const digits = neg ? int.slice(1) : int
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${grouped}.${frac}`
}

/** 整数分求和，结果仅用于即时显示，以服务端重算为准 */
export function sumCents(values: (number | null | undefined)[]): number {
  return values.reduce<number>((s, v) => s + (v ?? 0), 0)
}

/**
 * 数量 × 单价（分），按 HALF_UP 四舍五入到分，与服务端 BigDecimal 计算一致。
 * quantity 为十进制字符串，最多 3 位小数。非法输入返回 null。
 */
export function multiplyCents(quantity: string | null, unitPriceCents: number | null): number | null {
  if (quantity === null || unitPriceCents === null) return null
  // 单价必须是安全范围内的非负整数分
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) return null
  const m = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(quantity.trim())
  if (!m) return null
  const frac = (m[2] ?? '').padEnd(3, '0')
  // 数量放大 1000 倍后做整数乘法，再除以 1000 四舍五入
  const q = BigInt(m[1]) * 1000n + BigInt(frac)
  const product = q * BigInt(unitPriceCents)
  const result = (product + 500n) / 1000n
  // 超出安全整数范围时 BigInt -> number 会丢精度，视为无效
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(result)
}
