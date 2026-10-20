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

/** 点击涟漪波前扩散速度（px/ms），约 1000ms 扩散到 240px */
export const RIPPLE_SPEED = 0.24

/** 点击涟漪总时长（ms） */
export const RIPPLE_DURATION = 1000

/** 点击涟漪波长（px） */
export const RIPPLE_WAVELENGTH = 36

/** 第二道波的波长（px）：与主波错开，波后不再是单一正弦 */
export const RIPPLE_WAVELENGTH_2 = 58

/** 点击涟漪高斯包络宽度（px） */
export const RIPPLE_SIGMA = 48

/** 第二道波的高斯包络宽度（px） */
export const RIPPLE_SIGMA_2 = 74

/** 第二道波相对主波的权重 */
export const RIPPLE_SECOND_WEIGHT = 0.35

/** 波前柔和过渡宽度（px）：避免波前像刀切一样突然出现 */
export const RIPPLE_FRONT_SOFTNESS = 10

/** 点击中心的下压比例与半径 */
export const RIPPLE_CENTER_WEIGHT = 0.22
export const RIPPLE_CENTER_SIGMA = 26

/** 单点最大合成位移（px） */
export const RIPPLE_MAX_DISPLACEMENT = 6

/** 点击涟漪最大振幅（px） */
export const RIPPLE_MAX_AMPLITUDE = 5

/**
 * 涟漪波前半径：以 0.24px/ms 向外扩散
 */
export function rippleRadius(t: number): number {
  if (t <= 0) return 0
  return RIPPLE_SPEED * t
}

/**
 * 涟漪振幅随时间平滑衰减：A = A₀ · smoothstep(1 − t/T)
 * 两端导数为 0，波起波落都不会有生硬的折点。
 */
export function rippleAmplitude(t: number): number {
  if (t >= RIPPLE_DURATION) return 0
  if (t <= 0) return RIPPLE_MAX_AMPLITUDE
  const p = 1 - t / RIPPLE_DURATION
  return RIPPLE_MAX_AMPLITUDE * p * p * (3 - 2 * p)
}

/**
 * 单个涟漪对点的径向位移（正数向外）。
 * 主波 + 一道更长的次波，波前用 10px 的软过渡，中心带一点轻微下压；
 * 合成位移限制在 ±RIPPLE_MAX_DISPLACEMENT，避免点阵被推得太散。
 * @param d 点到涟漪圆心的距离
 * @param r 波前半径（由 rippleRadius 得到）
 * @param t 涟漪已进行的毫秒数
 */
export function rippleOffset(d: number, r: number, t: number): number {
  if (t < 0 || t >= RIPPLE_DURATION) return 0
  if (d > r) return 0
  const amp = rippleAmplitude(t)
  if (amp <= 0) return 0
  const phase = Math.max(0, r - d)
  const front = Math.min(1, phase / RIPPLE_FRONT_SOFTNESS)
  const env1 = Math.exp(-((phase / RIPPLE_SIGMA) ** 2))
  const env2 = Math.exp(-((phase / RIPPLE_SIGMA_2) ** 2))
  const wave1 = Math.sin((2 * Math.PI * phase) / RIPPLE_WAVELENGTH)
  const wave2 = Math.sin((2 * Math.PI * phase) / RIPPLE_WAVELENGTH_2 + 0.9)
  const center = -RIPPLE_CENTER_WEIGHT * Math.exp(-((d / RIPPLE_CENTER_SIGMA) ** 2))
  const raw = (wave1 * env1 + RIPPLE_SECOND_WEIGHT * wave2 * env2 + center) * front
  const value = amp * raw
  return Math.max(-RIPPLE_MAX_DISPLACEMENT, Math.min(RIPPLE_MAX_DISPLACEMENT, value))
}

/**
 * 由径向位移得到 0..1 的强调强度（|offset| / A₀），
 * 用于放大（最大 1.8 倍）与向 primary 的颜色插值（透明度最高 0.5）
 */
export function rippleEmphasis(offset: number, maxAmplitude = RIPPLE_MAX_AMPLITUDE): number {
  if (maxAmplitude <= 0) return 0
  const ratio = Math.abs(offset) / maxAmplitude
  if (ratio <= 0) return 0
  if (ratio >= 1) return 1
  return ratio
}

/**
 * 背景点阵的布朗运动。
 * 每个点像水里的花粉：不停地被看不见的水分子随机撞击，水的粘滞又让它很快忘掉上一次撞击；
 * 另有一根软弹簧把点拴在网格原位，点阵整体不会散开。
 * 各点的撞击互相独立，所以相邻两点毫无关联，各抖各的。
 *
 *   dv = (−γ·v − ω²·x)·dt + 随机冲量
 *
 * 稳态下单轴位移的标准差为 BROWNIAN_SIGMA，单轴速度的标准差为 ω·σ。
 */
export const BROWNIAN_SIGMA = 3

/** 弹簧角频率（rad/s）：越大越快被拉回原位 */
export const BROWNIAN_OMEGA = 2

/** 水的阻尼（1/s）：越大速度越快被打乱，轨迹越碎 */
export const BROWNIAN_DAMPING = 6

/** 单轴位移硬上限（px），约 3.3σ，点阵始终能看出是网格 */
export const BROWNIAN_MAX = 10

/** 单步最长时长（s）：切回标签页或掉帧后不会一步跳太远 */
export const BROWNIAN_MAX_DT = 0.05

/** 光标正下方额外升高的温度倍数：温度越高，布朗运动越剧烈 */
export const BROWNIAN_CURSOR_HEAT = 1.6

const BROWNIAN_SPRING = BROWNIAN_OMEGA * BROWNIAN_OMEGA

// [−√3, √3) 上的均匀分布方差为 1；每帧的冲量累积起来按中心极限定理就是高斯
const UNIT_SPAN = 2 * Math.sqrt(3)

export interface BrownianField {
  cols: number
  rows: number
  /** 相对网格原位的位移（px），下标 = col * rows + row */
  x: Float32Array
  y: Float32Array
  /** 速度（px/s） */
  vx: Float32Array
  vy: Float32Array
}

export interface BrownianStep {
  /** 本步时长（s），已截断到 [0, BROWNIAN_MAX_DT] */
  dt: number
  /** 阻尼在 dt 内对速度的精确衰减 e^(−γ·dt) */
  decay: number
  /** 常温下单轴速度冲量的标准差（px/s） */
  kick: number
}

function gaussian(rand: () => number): number {
  // Box–Muller；1 − u 落在 (0, 1]，避免 log(0)
  const u = 1 - rand()
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function clampDisplacement(value: number): number {
  return Math.max(-BROWNIAN_MAX, Math.min(BROWNIAN_MAX, value))
}

/**
 * 建立（或按新尺寸重建）点阵的布朗状态。
 * 与旧网格重叠的点保留原来的位移和速度，拖动窗口缩放时点阵不会整体跳一下；
 * 新出现的点直接从稳态分布取样，一出现就在动。
 */
export function resizeBrownianField(
  prev: BrownianField | null,
  cols: number,
  rows: number,
  rand: () => number = Math.random,
): BrownianField {
  const c = Math.max(0, Math.floor(cols))
  const r = Math.max(0, Math.floor(rows))
  if (prev && prev.cols === c && prev.rows === r) return prev

  const count = c * r
  const next: BrownianField = {
    cols: c,
    rows: r,
    x: new Float32Array(count),
    y: new Float32Array(count),
    vx: new Float32Array(count),
    vy: new Float32Array(count),
  }
  const speedSigma = BROWNIAN_OMEGA * BROWNIAN_SIGMA
  for (let col = 0; col < c; col++) {
    for (let row = 0; row < r; row++) {
      const i = col * r + row
      if (prev && col < prev.cols && row < prev.rows) {
        const j = col * prev.rows + row
        next.x[i] = prev.x[j]
        next.y[i] = prev.y[j]
        next.vx[i] = prev.vx[j]
        next.vy[i] = prev.vy[j]
        continue
      }
      next.x[i] = clampDisplacement(gaussian(rand) * BROWNIAN_SIGMA)
      next.y[i] = clampDisplacement(gaussian(rand) * BROWNIAN_SIGMA)
      next.vx[i] = gaussian(rand) * speedSigma
      next.vy[i] = gaussian(rand) * speedSigma
    }
  }
  return next
}

/**
 * 每帧算一次的步进系数。dt 非正按 0（不动）处理，过长按 BROWNIAN_MAX_DT 截断。
 * 冲量大小按 1 − decay² 取，帧率高低不影响稳态下的抖动幅度。
 */
export function brownianStep(dtSec: number): BrownianStep {
  const dt = dtSec > 0 ? Math.min(dtSec, BROWNIAN_MAX_DT) : 0
  const decay = Math.exp(-BROWNIAN_DAMPING * dt)
  const kick = BROWNIAN_OMEGA * BROWNIAN_SIGMA * Math.sqrt(1 - decay * decay)
  return { dt, decay, kick }
}

/**
 * 把第 i 个点推进一步。
 * @param temperature 局部温度倍数（1 = 常温）；冲量按 √T 放大，稳态抖动幅度也随之按 √T 变大
 */
export function stepBrownianDot(
  field: BrownianField,
  i: number,
  step: BrownianStep,
  temperature = 1,
  rand: () => number = Math.random,
): void {
  if (step.dt <= 0) return
  const kick = step.kick * Math.sqrt(Math.max(0, temperature)) * UNIT_SPAN
  let x = field.x[i]
  let y = field.y[i]
  let vx = field.vx[i] * step.decay - BROWNIAN_SPRING * x * step.dt + kick * (rand() - 0.5)
  let vy = field.vy[i] * step.decay - BROWNIAN_SPRING * y * step.dt + kick * (rand() - 0.5)
  x += vx * step.dt
  y += vy * step.dt
  // 撞到上限就停在边上，只去掉继续往外的速度
  if (x > BROWNIAN_MAX) {
    x = BROWNIAN_MAX
    if (vx > 0) vx = 0
  } else if (x < -BROWNIAN_MAX) {
    x = -BROWNIAN_MAX
    if (vx < 0) vx = 0
  }
  if (y > BROWNIAN_MAX) {
    y = BROWNIAN_MAX
    if (vy > 0) vy = 0
  } else if (y < -BROWNIAN_MAX) {
    y = -BROWNIAN_MAX
    if (vy < 0) vy = 0
  }
  field.x[i] = x
  field.y[i] = y
  field.vx[i] = vx
  field.vy[i] = vy
}

/**
 * 光标快速拖动时，附近点沿运动方向的轻微拖尾位移。
 * 速度越快越明显，但不超过 maxTrail；停下后由调用方衰减。
 */
export function calcTrailOffset(
  vx: number,
  vy: number,
  influence: number,
  maxTrail = 2.4,
): { x: number; y: number } {
  if (influence <= 0 || maxTrail <= 0) return { x: 0, y: 0 }
  const speed = Math.hypot(vx, vy)
  if (speed <= 0.001) return { x: 0, y: 0 }
  const scale = Math.min(1, speed / 14) * influence
  return {
    x: (vx / speed) * maxTrail * scale,
    y: (vy / speed) * maxTrail * scale,
  }
}
