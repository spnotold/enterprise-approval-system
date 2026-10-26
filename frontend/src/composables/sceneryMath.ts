// 背景风景的纯计算部分（绘制和计时在 useScenery.ts）：图片铺满的位置、鼠标掀起的风、飘叶的运动。

/** 风景图按 cover 铺满视口、底边对齐时，图片在视口坐标里的位置和大小 */
export function coverRect(viewW: number, viewH: number, imgW: number, imgH: number) {
  const scale = Math.max(viewW / imgW, viewH / imgH)
  const width = imgW * scale
  const height = imgH * scale
  return { x: (viewW - width) / 2, y: viewH - height, width, height }
}

/** 一阵风：从 x（视口宽为 1）出发，沿 dir 方向扫过草地，强度 strength，起于 t0 秒 */
export interface Gust {
  x: number
  dir: 1 | -1
  t0: number
  strength: number
}

/** 着色器里同时存在的风最多 4 阵，满了覆盖最早的 */
export const MAX_GUSTS = 4
/** 两阵鼠标风之间至少隔这么久（秒），快速来回晃鼠标不会叠成一大片 */
export const GUST_INTERVAL = 0.35
/** 鼠标两次移动之间横向超过这么多像素才起风 */
export const GUST_MIN_DX = 4

/**
 * 鼠标横向移动 dx 像素时是否起一阵风；不起风返回 null。
 * 强度按移动速度线性增长，24px 封顶为 1。
 */
export function gustFromPointer(x: number, viewW: number, dx: number, now: number, lastGustAt: number): Gust | null {
  if (Math.abs(dx) <= GUST_MIN_DX || now - lastGustAt < GUST_INTERVAL || viewW <= 0) return null
  return { x: x / viewW, dir: dx > 0 ? 1 : -1, t0: now, strength: Math.min(1, Math.abs(dx) / 24) }
}

/** 把风写进长度 MAX_GUSTS 的环形队列，返回下一个写入位置 */
export function pushGust(queue: (Gust | null)[], cursor: number, gust: Gust): number {
  queue[cursor % MAX_GUSTS] = gust
  return (cursor + 1) % MAX_GUSTS
}

/** 着色器 uniform：每阵风 4 个数（x、方向、起始时间、强度），空位全 0 */
export function packGusts(queue: (Gust | null)[]): Float32Array {
  const out = new Float32Array(MAX_GUSTS * 4)
  queue.slice(0, MAX_GUSTS).forEach((g, i) => {
    if (g) out.set([g.x, g.dir, g.t0, g.strength], i * 4)
  })
  return out
}

export interface Leaf {
  /** 用第几张叶子图 */
  kind: number
  x: number
  y: number
  vx: number
  vy: number
  /** 叶子宽度（px） */
  size: number
  rot: number
  spin: number
  /** 摆动和翻面的相位 */
  phase: number
  /** 被鼠标推开的速度，逐帧衰减 */
  px: number
  py: number
}

/** 同时最多几片叶子 */
export const MAX_LEAVES = 4
/** 两片叶子之间的间隔（秒）：min + random × spread */
export const LEAF_INTERVAL_MIN = 5
export const LEAF_INTERVAL_SPREAD = 5
/** 鼠标推开叶子的范围（px） */
export const LEAF_PUSH_RADIUS = 110

/** 从左边（或给定 x）放一片叶子；rand 取 [0, 1) */
export function spawnLeaf(rand: () => number, viewH: number, kinds: number, x = -40): Leaf {
  return {
    kind: Math.floor(rand() * kinds) % Math.max(1, kinds),
    x,
    y: viewH * (0.05 + rand() * 0.75),
    vx: 22 + rand() * 18,
    vy: 5 + rand() * 9,
    size: 20 + rand() * 12,
    rot: rand() * Math.PI * 2,
    spin: (rand() - 0.5) * 0.9,
    phase: rand() * Math.PI * 2,
    px: 0,
    py: 0,
  }
}

/** 推进一帧：顺风往右飘，上下轻摆，被推开的速度逐帧衰减 */
export function stepLeaf(leaf: Leaf, dt: number, t: number): void {
  leaf.x += (leaf.vx * (0.9 + 0.4 * Math.sin(t * 0.43)) + leaf.px) * dt
  leaf.y += (leaf.vy + Math.sin(t * 1.3 + leaf.phase) * 10 + leaf.py) * dt
  leaf.px *= 0.96
  leaf.py *= 0.96
  leaf.rot += leaf.spin * dt
}

/** 叶子翻面：横向缩放在 0.25 到 1 之间来回 */
export function leafFlip(leaf: Leaf, t: number): number {
  return Math.max(0.25, Math.abs(Math.cos(t * 1.4 + leaf.phase)))
}

/** 鼠标在 (x, y) 时把附近的叶子推开 */
export function pushLeaf(leaf: Leaf, x: number, y: number): void {
  const d = Math.hypot(leaf.x - x, leaf.y - y)
  if (d >= LEAF_PUSH_RADIUS || d === 0) return
  leaf.px += ((leaf.x - x) / d) * 40
  leaf.py += ((leaf.y - y) / d) * 40
}

/** 叶子飘出视口就回收 */
export function isLeafGone(leaf: Leaf, viewW: number, viewH: number): boolean {
  return leaf.x > viewW + 60 || leaf.y > viewH + 60 || leaf.x < -120
}
