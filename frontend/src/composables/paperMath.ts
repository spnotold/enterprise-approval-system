export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/**
 * 将 3 位或 6 位 hex 字符串解析为 RGB 数值
 */
export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim()
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 0,
      g: parseInt(clean[1] + clean[1], 16) || 0,
      b: parseInt(clean[2] + clean[2], 16) || 0,
    }
  }
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  }
}

/**
 * 计算点受光标影响的强度因子 (1 - d/R)^2
 * @param dist 点到光标的欧式距离
 * @param radius 影响半径 R（默认 140px）
 * @returns 0 到 1 之间的强度因子
 */
export function calcDotInfluence(dist: number, radius: number): number {
  if (dist >= radius || radius <= 0 || dist < 0) return 0
  const normalized = 1 - dist / radius
  return normalized * normalized
}

/**
 * 计算点向光标偏移后的坐标
 * @param x0 点的静态原始 X 坐标
 * @param y0 点的静态原始 Y 坐标
 * @param cx 光标当前缓动 X 坐标
 * @param cy 光标当前缓动 Y 坐标
 * @param dist 点与光标的欧式距离
 * @param maxOffset 最大偏移量（默认 3px）
 * @param influence 当前受影响强度（已包含离开淡出因子）
 */
export function calcDotOffset(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  dist: number,
  maxOffset: number,
  influence: number,
): { x: number; y: number } {
  if (dist <= 0 || influence <= 0 || maxOffset <= 0) {
    return { x: x0, y: y0 }
  }
  const offset = maxOffset * influence
  const dx = ((cx - x0) / dist) * offset
  const dy = ((cy - y0) / dist) * offset
  return { x: x0 + dx, y: y0 + dy }
}

/**
 * 计算点的动态半径
 * @param baseRadius 基础半径（默认 1.0px）
 * @param maxRadius 最大半径（默认 1.8px）
 * @param influence 当前受影响强度（0 ~ 1）
 */
export function calcDotRadius(
  baseRadius: number,
  maxRadius: number,
  influence: number,
): number {
  const clamped = Math.max(0, Math.min(1, influence))
  return baseRadius + (maxRadius - baseRadius) * clamped
}

/**
 * 线性插值 RGBA 颜色
 * 从 baseColor 过渡到 targetColor
 */
export function interpolateRgba(
  base: Rgba,
  target: Rgba,
  t: number,
): Rgba {
  const clamped = Math.max(0, Math.min(1, t))
  return {
    r: Math.round(base.r + (target.r - base.r) * clamped),
    g: Math.round(base.g + (target.g - base.g) * clamped),
    b: Math.round(base.b + (target.b - base.b) * clamped),
    a: Number((base.a + (target.a - base.a) * clamped).toFixed(3)),
  }
}

/**
 * 光标位置逐帧逼近（缓动系数默认 18%）
 */
export function easeCursor(
  current: number,
  target: number,
  factor = 0.18,
): number {
  return current + (target - current) * factor
}

/**
 * 判断光标位置是否已逼近稳定（阈值默认 0.5px）
 */
export function isSettled(
  current: { x: number; y: number },
  target: { x: number; y: number },
  threshold = 0.5,
): boolean {
  return (
    Math.abs(target.x - current.x) < threshold &&
    Math.abs(target.y - current.y) < threshold
  )
}

/**
 * 计算点击波纹细环的半径与透明度
 * 500ms 内半径 0 -> 90px，透明度 0.25 -> 0
 */
export function calcRippleProgress(
  elapsed: number,
  duration = 500,
  maxRadius = 90,
  maxAlpha = 0.25,
): { radius: number; alpha: number; done: boolean } {
  if (elapsed >= duration || duration <= 0) {
    return { radius: maxRadius, alpha: 0, done: true }
  }
  const progress = Math.max(0, elapsed / duration)
  return {
    radius: maxRadius * progress,
    alpha: Number((maxAlpha * (1 - progress)).toFixed(3)),
    done: false,
  }
}
