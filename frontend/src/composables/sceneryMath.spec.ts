import { describe, expect, it } from 'vitest'
import {
  GUST_INTERVAL,
  MAX_DPR,
  backingScale,
  LEAF_PUSH_RADIUS,
  MAX_GUSTS,
  coverRect,
  gustFromPointer,
  isLeafGone,
  leafFlip,
  packGusts,
  pushGust,
  pushLeaf,
  spawnLeaf,
  stepLeaf,
  type Gust,
} from './sceneryMath'

const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('coverRect', () => {
  it('fills a wide viewport and anchors the bottom edge', () => {
    const r = coverRect(1600, 900, 1672, 941)
    expect(r.width).toBeGreaterThanOrEqual(1600)
    expect(r.height).toBeGreaterThanOrEqual(900)
    expect(r.y + r.height).toBeCloseTo(900)
    expect(r.x).toBeCloseTo((1600 - r.width) / 2)
  })

  it('crops the sides on a tall viewport', () => {
    const r = coverRect(400, 900, 1672, 941)
    expect(r.height).toBeCloseTo(900)
    expect(r.width).toBeGreaterThan(400)
    expect(r.y).toBeCloseTo(0)
  })
})

describe('backingScale', () => {
  it('uses the device pixel ratio up to the cap', () => {
    expect(backingScale(1440, 900, 1, 8192)).toBe(1)
    expect(backingScale(1440, 900, 1.5, 8192)).toBe(1.5)
    expect(backingScale(1440, 900, 3, 8192)).toBe(MAX_DPR)
    expect(backingScale(1440, 900, 0.5, 8192)).toBe(1)
  })

  it('shrinks both sides by the same factor when a side would exceed the GPU limit', () => {
    const scale = backingScale(5000, 2000, 2, 8192)
    expect(5000 * scale).toBeLessThanOrEqual(8192)
    expect(scale).toBeCloseTo(8192 / 5000)
  })
})

describe('gustFromPointer', () => {
  it('ignores small moves and rapid repeats', () => {
    expect(gustFromPointer(100, 1000, 3, 10, -Infinity)).toBeNull()
    expect(gustFromPointer(100, 1000, 20, 10, 10 - GUST_INTERVAL / 2)).toBeNull()
  })

  it('starts at the pointer, follows the move direction and caps strength', () => {
    expect(gustFromPointer(250, 1000, 12, 5, -Infinity)).toEqual({ x: 0.25, dir: 1, t0: 5, strength: 0.5 })
    expect(gustFromPointer(250, 1000, -80, 5, 0)).toMatchObject({ dir: -1, strength: 1 })
  })
})

describe('gust queue', () => {
  it('wraps around and packs four floats per gust', () => {
    const queue: (Gust | null)[] = new Array(MAX_GUSTS).fill(null)
    let cursor = 0
    for (let i = 0; i < MAX_GUSTS + 1; i++) cursor = pushGust(queue, cursor, { x: i / 10, dir: 1, t0: i, strength: 1 })
    expect(cursor).toBe(1)
    expect(queue[0]?.t0).toBe(MAX_GUSTS)
    const packed = packGusts(queue)
    expect(packed).toHaveLength(MAX_GUSTS * 4)
    expect(Array.from(packed.slice(0, 4))).toEqual([0.4000000059604645, 1, 4, 1])
  })

  it('leaves empty slots as zeros so the shader skips them', () => {
    expect(Array.from(packGusts([null, null]))).toEqual(new Array(MAX_GUSTS * 4).fill(0))
  })
})

describe('leaves', () => {
  it('spawns off the left edge inside the upper four fifths', () => {
    const leaf = spawnLeaf(seq(0.99, 0.5), 1000, 6)
    expect(leaf.x).toBe(-40)
    expect(leaf.kind).toBe(5)
    expect(leaf.y).toBeGreaterThanOrEqual(50)
    expect(leaf.y).toBeLessThanOrEqual(800)
  })

  it('drifts right and lets a push decay', () => {
    const leaf = spawnLeaf(seq(0.5), 800, 6, 100)
    leaf.px = 40
    const x0 = leaf.x
    stepLeaf(leaf, 0.1, 0)
    expect(leaf.x).toBeGreaterThan(x0)
    expect(leaf.px).toBeCloseTo(38.4)
  })

  it('is pushed away from a nearby pointer only', () => {
    const leaf = spawnLeaf(seq(0.5), 800, 6, 100)
    leaf.y = 100
    pushLeaf(leaf, 100 - LEAF_PUSH_RADIUS - 1, 100)
    expect(leaf.px).toBe(0)
    pushLeaf(leaf, 60, 100)
    expect(leaf.px).toBeGreaterThan(0)
  })

  it('flips between a quarter and full width and is recycled off screen', () => {
    const leaf = spawnLeaf(seq(0.5), 800, 6, 100)
    for (const t of [0, 0.5, 1, 2]) {
      expect(leafFlip(leaf, t)).toBeGreaterThanOrEqual(0.25)
      expect(leafFlip(leaf, t)).toBeLessThanOrEqual(1)
    }
    expect(isLeafGone({ ...leaf, x: 1100 }, 1000, 800)).toBe(true)
    expect(isLeafGone({ ...leaf, x: 500 }, 1000, 800)).toBe(false)
  })
})
