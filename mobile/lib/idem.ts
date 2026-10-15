// 幂等键：在用户打开确认框时生成，同一次操作的重试复用同一个键。
// 小程序没有 crypto，不能直接复用 Web 端 idem.ts：有 crypto.getRandomValues 时（H5）用它，
// 否则用 Math.random 并混入时间戳与计数器。幂等键只需在同一用户的请求间不重复，不用于安全目的。

let counter = 0

function randomBytes(n: number): number[] {
  const out: number[] = []
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint8Array(n)
    c.getRandomValues(buf)
    for (let i = 0; i < n; i++) out.push(buf[i])
    return out
  }
  for (let i = 0; i < n; i++) out.push(Math.floor(Math.random() * 256))
  // 混入毫秒时间戳与进程内计数器，降低 Math.random 质量不佳时的碰撞概率
  let t = Date.now()
  for (let i = 0; i < 6; i++) {
    out[i] ^= t & 0xff
    t = Math.floor(t / 256)
  }
  counter = (counter + 1) & 0xffff
  out[10] ^= counter & 0xff
  out[11] ^= (counter >> 8) & 0xff
  return out
}

/** 生成 UUID v4 字符串 */
export function newIdemKey(): string {
  const bytes = randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
