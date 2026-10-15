// 十进制字符串工具（自定义表单 NUMBER 字段、采购数量），全部按字符串比较，不经过 parseFloat。

const DEC = /^(-?)(\d+)(?:\.(\d+))?$/

export function isDecimal(s: string): boolean {
  return DEC.test(s.trim())
}

export function decimalPlaces(s: string): number {
  const m = DEC.exec(s.trim())
  return m && m[3] ? m[3].length : 0
}

/** 规范化：去掉多余的前导 0 与末尾 0，"-0" 记为 "0" */
function normalize(s: string): { neg: boolean; int: string; frac: string } | null {
  const m = DEC.exec(s.trim())
  if (!m) return null
  const int = m[2].replace(/^0+(?=\d)/, '')
  const frac = (m[3] ?? '').replace(/0+$/, '')
  const zero = int === '0' && frac === ''
  return { neg: m[1] === '-' && !zero, int, frac }
}

function compareAbs(a: { int: string; frac: string }, b: { int: string; frac: string }): number {
  if (a.int.length !== b.int.length) return a.int.length < b.int.length ? -1 : 1
  if (a.int !== b.int) return a.int < b.int ? -1 : 1
  const len = Math.max(a.frac.length, b.frac.length)
  const fa = a.frac.padEnd(len, '0')
  const fb = b.frac.padEnd(len, '0')
  return fa === fb ? 0 : fa < fb ? -1 : 1
}

/** 比较两个十进制字符串；任一非法时返回 null */
export function compareDecimal(a: string, b: string): number | null {
  const x = normalize(a)
  const y = normalize(b)
  if (!x || !y) return null
  if (x.neg !== y.neg) return x.neg ? -1 : 1
  const c = compareAbs(x, y)
  return x.neg ? -c : c
}

/** 数字输入框的清洗：只保留数字、一个小数点和开头的负号 */
export function sanitizeDecimalInput(s: string, allowNegative = false, maxFrac = 4): string {
  let v = s.replace(/[^\d.-]/g, '')
  const neg = allowNegative && v.startsWith('-')
  v = v.replace(/-/g, '')
  const dot = v.indexOf('.')
  if (dot >= 0) {
    v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, maxFrac)
    if (maxFrac === 0) v = v.slice(0, dot)
  }
  return (neg ? '-' : '') + v
}
