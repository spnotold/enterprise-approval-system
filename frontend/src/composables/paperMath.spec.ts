import { describe, expect, it } from 'vitest'
import {
  BROWNIAN_CURSOR_HEAT,
  BROWNIAN_MAX,
  BROWNIAN_MAX_DT,
  BROWNIAN_SIGMA,
  RIPPLE_MAX_AMPLITUDE,
  brownianStep,
  calcDotInfluence,
  calcDotOffset,
  calcDotRadius,
  calcTrailOffset,
  easeCursor,
  interpolateRgba,
  isSettled,
  parseHexColor,
  rippleAmplitude,
  rippleEmphasis,
  rippleOffset,
  rippleRadius,
  resizeBrownianField,
  stepBrownianDot,
  type BrownianField,
} from './paperMath'

describe('paperMath', () => {
  describe('parseHexColor', () => {
    it('parses 6-digit hex color correctly', () => {
      expect(parseHexColor('#c4c9c3')).toEqual({ r: 196, g: 201, b: 195 })
      expect(parseHexColor('#3e5c76')).toEqual({ r: 62, g: 92, b: 118 })
      expect(parseHexColor('#f2f3f0')).toEqual({ r: 242, g: 243, b: 240 })
    })

    it('parses 3-digit hex color correctly', () => {
      expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 })
      expect(parseHexColor('#000')).toEqual({ r: 0, g: 0, b: 0 })
    })

    it('handles invalid or empty strings gracefully', () => {
      expect(parseHexColor('')).toEqual({ r: 0, g: 0, b: 0 })
    })
  })

  describe('calcDotInfluence', () => {
    const R = 140

    it('returns 1.0 when distance is 0', () => {
      expect(calcDotInfluence(0, R)).toBe(1)
    })

    it('returns 0.25 when distance is half the radius (70px)', () => {
      expect(calcDotInfluence(70, R)).toBeCloseTo(0.25, 5)
    })

    it('returns 0 when distance equals or exceeds radius', () => {
      expect(calcDotInfluence(140, R)).toBe(0)
      expect(calcDotInfluence(150, R)).toBe(0)
    })

    it('returns 0 for negative distance or non-positive radius', () => {
      expect(calcDotInfluence(-5, R)).toBe(0)
      expect(calcDotInfluence(10, 0)).toBe(0)
    })
  })

  describe('calcDotOffset', () => {
    it('offsets towards cursor along the vector between point and cursor', () => {
      const x0 = 100
      const y0 = 100
      const cx = 170
      const cy = 100
      const dist = 70
      const maxOffset = 3
      const influence = 0.25 // factor at 70px

      const res = calcDotOffset(x0, y0, cx, cy, dist, maxOffset, influence)
      // dx should be positive 3 * 0.25 = 0.75
      expect(res.x).toBeCloseTo(100.75, 4)
      expect(res.y).toBeCloseTo(100, 4)
    })

    it('returns original coordinates if distance or influence is 0', () => {
      expect(calcDotOffset(50, 50, 50, 50, 0, 3, 1)).toEqual({ x: 50, y: 50 })
      expect(calcDotOffset(50, 50, 100, 100, 50, 3, 0)).toEqual({ x: 50, y: 50 })
    })
  })

  describe('calcDotRadius', () => {
    it('scales radius from 1.0 to 1.8 based on influence', () => {
      expect(calcDotRadius(1.0, 1.8, 0)).toBe(1.0)
      expect(calcDotRadius(1.0, 1.8, 0.5)).toBeCloseTo(1.4, 4)
      expect(calcDotRadius(1.0, 1.8, 1.0)).toBe(1.8)
    })

    it('clamps influence between 0 and 1', () => {
      expect(calcDotRadius(1.0, 1.8, -0.5)).toBe(1.0)
      expect(calcDotRadius(1.0, 1.8, 1.5)).toBe(1.8)
    })
  })

  describe('interpolateRgba', () => {
    const base = { r: 196, g: 201, b: 195, a: 0.6 }
    const target = { r: 62, g: 92, b: 118, a: 0.55 }

    it('returns base color when t = 0', () => {
      expect(interpolateRgba(base, target, 0)).toEqual(base)
    })

    it('returns target color when t = 1', () => {
      expect(interpolateRgba(base, target, 1)).toEqual(target)
    })

    it('correctly interpolates midpoint when t = 0.5', () => {
      const mid = interpolateRgba(base, target, 0.5)
      expect(mid.r).toBe(Math.round(196 + (62 - 196) * 0.5)) // 129
      expect(mid.g).toBe(Math.round(201 + (92 - 201) * 0.5)) // 147
      expect(mid.b).toBe(Math.round(195 + (118 - 195) * 0.5)) // 157
      expect(mid.a).toBe(0.575)
    })
  })

  describe('easeCursor', () => {
    it('approaches target by 18% per step', () => {
      const cur = 0
      const target = 100
      const next = easeCursor(cur, target, 0.18)
      expect(next).toBe(18)
      const next2 = easeCursor(next, target, 0.18)
      expect(next2).toBe(18 + 82 * 0.18) // 32.76
    })
  })

  describe('isSettled', () => {
    it('detects when cursor distance is under threshold', () => {
      expect(isSettled({ x: 100, y: 100 }, { x: 100.3, y: 100.4 }, 0.5)).toBe(true)
      expect(isSettled({ x: 100, y: 100 }, { x: 100.6, y: 100 }, 0.5)).toBe(false)
      expect(isSettled({ x: 100, y: 100 }, { x: 100, y: 100.51 }, 0.5)).toBe(false)
    })
  })

  describe('rippleRadius', () => {
    it('expands the wavefront at 0.24px/ms (240px at 1000ms)', () => {
      expect(rippleRadius(0)).toBe(0)
      expect(rippleRadius(250)).toBeCloseTo(60, 5)
      expect(rippleRadius(500)).toBeCloseTo(120, 5)
      expect(rippleRadius(1000)).toBeCloseTo(240, 5)
    })

    it('treats non-positive time as no expansion', () => {
      expect(rippleRadius(-100)).toBe(0)
    })
  })

  describe('rippleAmplitude', () => {
    it('decays smoothly from 5px to 0 over 1000ms', () => {
      expect(rippleAmplitude(0)).toBe(5)
      expect(rippleAmplitude(250)).toBeCloseTo(4.21875, 5)
      expect(rippleAmplitude(500)).toBeCloseTo(2.5, 5)
      expect(rippleAmplitude(750)).toBeCloseTo(0.78125, 5)
      expect(rippleAmplitude(1000)).toBe(0)
      expect(rippleAmplitude(1500)).toBe(0)
    })

    it('keeps the maximum amplitude for non-positive time', () => {
      expect(rippleAmplitude(-100)).toBe(RIPPLE_MAX_AMPLITUDE)
    })
  })

  describe('rippleOffset', () => {
    it('is zero outside the wave (d > r) or after the ripple ends (t >= 1000)', () => {
      expect(rippleOffset(200, 100, 200)).toBe(0)
      expect(rippleOffset(10, 0, 0)).toBe(0)
      expect(rippleOffset(120.001, 120, 500)).toBe(0)
      expect(rippleOffset(0, 240, 1000)).toBe(0)
      expect(rippleOffset(0, 240, 1200)).toBe(0)
    })

    it('is zero at the wavefront, including the initial zero radius', () => {
      for (const t of [0, 1, 250, 500, 750, 999]) {
        const r = rippleRadius(t)
        expect(rippleOffset(r, r, t)).toBe(0)
      }
    })

    it('stays finite and within ±6px across the wave and its lifetime', () => {
      for (const t of [0, 1, 40, 100, 250, 500, 750, 999, 1000, 1500]) {
        const r = rippleRadius(t)
        for (let step = 0; step <= 100; step++) {
          const offset = rippleOffset((r * step) / 100, r, t)
          expect(Number.isFinite(offset)).toBe(true)
          expect(Math.abs(offset)).toBeLessThanOrEqual(6)
        }
      }
    })

    it('contains both outward and inward offsets behind the wavefront', () => {
      for (const t of [250, 500, 750]) {
        const r = rippleRadius(t)
        const offsets = Array.from({ length: Math.floor(r) }, (_, d) => rippleOffset(d, r, t))
        expect(offsets.some((offset) => offset > 0)).toBe(true)
        expect(offsets.some((offset) => offset < 0)).toBe(true)
      }
    })

    it('returns zero before the ripple starts', () => {
      expect(rippleOffset(0, 120, -1)).toBe(0)
    })
  })

  describe('rippleEmphasis', () => {
    it('maps |offset| / A₀ to 0..1', () => {
      expect(rippleEmphasis(0)).toBe(0)
      expect(rippleEmphasis(1.25)).toBeCloseTo(0.25, 6)
      expect(rippleEmphasis(2.5)).toBeCloseTo(0.5, 6)
      expect(rippleEmphasis(RIPPLE_MAX_AMPLITUDE)).toBe(1)
    })

    it('uses the absolute value so inward pulls also emphasize', () => {
      expect(rippleEmphasis(-1.25)).toBeCloseTo(0.25, 6)
      expect(rippleEmphasis(-2.5)).toBeCloseTo(0.5, 6)
    })

    it('clamps beyond the maximum amplitude', () => {
      expect(rippleEmphasis(7.5)).toBe(1)
      expect(rippleEmphasis(-9)).toBe(1)
    })

    it('scales with an explicit max amplitude and guards against zero', () => {
      expect(rippleEmphasis(2.5, 2.5)).toBe(1)
      expect(rippleEmphasis(2.5, 0)).toBe(0)
    })
  })

  describe('brownian motion', () => {
    // 固定种子的 PRNG，测试结果可复现
    const seeded = (seed: number) => {
      let a = seed >>> 0
      return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    const run = (
      field: BrownianField,
      seconds: number,
      fps: number,
      rand: () => number,
      temperature = 1,
      onFrame?: (frame: number) => void,
    ) => {
      const step = brownianStep(1 / fps)
      const count = field.cols * field.rows
      const frames = Math.round(seconds * fps)
      for (let f = 0; f < frames; f++) {
        for (let i = 0; i < count; i++) stepBrownianDot(field, i, step, temperature, rand)
        onFrame?.(f)
      }
    }

    const rms = (values: ArrayLike<number>) => {
      let sum = 0
      for (let i = 0; i < values.length; i++) sum += values[i] * values[i]
      return Math.sqrt(sum / values.length)
    }

    it('seeds a fresh grid from the stationary spread', () => {
      const field = resizeBrownianField(null, 40, 25, seeded(1))
      expect(field.x).toHaveLength(1000)
      for (let i = 0; i < 1000; i++) {
        expect(Math.abs(field.x[i])).toBeLessThanOrEqual(BROWNIAN_MAX)
        expect(Math.abs(field.y[i])).toBeLessThanOrEqual(BROWNIAN_MAX)
        expect(Number.isFinite(field.vx[i])).toBe(true)
      }
      expect(rms(field.x) / BROWNIAN_SIGMA).toBeGreaterThan(0.9)
      expect(rms(field.x) / BROWNIAN_SIGMA).toBeLessThan(1.1)
    })

    it('keeps overlapping dots on resize and returns the same field when the size is unchanged', () => {
      const prev = resizeBrownianField(null, 10, 8, seeded(2))
      expect(resizeBrownianField(prev, 10, 8)).toBe(prev)

      const next = resizeBrownianField(prev, 12, 6, seeded(3))
      expect(next.x).toHaveLength(72)
      for (let col = 0; col < 10; col++) {
        for (let row = 0; row < 6; row++) {
          expect(next.x[col * 6 + row]).toBe(prev.x[col * 8 + row])
          expect(next.vy[col * 6 + row]).toBe(prev.vy[col * 8 + row])
        }
      }
      expect(resizeBrownianField(prev, 0, 5).x).toHaveLength(0)
    })

    it('settles to the same visible spread at 30fps and 60fps without leaving the bound', () => {
      for (const [fps, seed] of [
        [30, 4],
        [60, 5],
      ]) {
        const field = resizeBrownianField(null, 40, 25, seeded(seed))
        const spreads: number[] = []
        let worst = 0
        run(field, 20, fps, seeded(seed + 100), 1, (frame) => {
          for (let i = 0; i < 1000; i++) worst = Math.max(worst, Math.abs(field.x[i]), Math.abs(field.y[i]))
          if (frame % fps === 0 && frame >= 5 * fps) spreads.push(rms(field.x), rms(field.y))
        })
        const spread = spreads.reduce((a, b) => a + b, 0) / spreads.length
        expect(spread / BROWNIAN_SIGMA).toBeGreaterThan(0.85)
        expect(spread / BROWNIAN_SIGMA).toBeLessThan(1.15)
        expect(worst).toBeLessThanOrEqual(BROWNIAN_MAX)
      }
    })

    it('moves every dot on its own, uncorrelated with its neighbour', () => {
      const field = resizeBrownianField(null, 40, 25, seeded(6))
      run(field, 6, 30, seeded(7))
      let sumAB = 0
      let sumAA = 0
      let sumBB = 0
      for (let col = 0; col < 40; col++) {
        for (let row = 0; row < 24; row++) {
          const a = field.x[col * 25 + row]
          const b = field.x[col * 25 + row + 1]
          sumAB += a * b
          sumAA += a * a
          sumBB += b * b
        }
      }
      expect(Math.abs(sumAB / Math.sqrt(sumAA * sumBB))).toBeLessThan(0.1)
    })

    it('forgets its direction within half a second, at a speed the eye can follow', () => {
      const field = resizeBrownianField(null, 40, 25, seeded(8))
      run(field, 3, 30, seeded(9))
      const before = Float32Array.from(field.vx)
      const speeds = Array.from({ length: 1000 }, (_, i) => Math.hypot(field.vx[i], field.vy[i])).sort((a, b) => a - b)
      run(field, 0.5, 30, seeded(10))

      let dot = 0
      let norm = 0
      for (let i = 0; i < 1000; i++) {
        dot += before[i] * field.vx[i]
        norm += before[i] * before[i]
      }
      expect(Math.abs(dot / norm)).toBeLessThan(0.25)

      const median = speeds[500]
      expect(median).toBeGreaterThan(5)
      expect(median).toBeLessThan(10)
    })

    it('jitters harder where it is warmer, and stays bounded even when overheated', () => {
      const cool = resizeBrownianField(null, 40, 25, seeded(11))
      const warm = resizeBrownianField(null, 40, 25, seeded(12))
      const hot = resizeBrownianField(null, 40, 25, seeded(13))
      const warmth = 1 + BROWNIAN_CURSOR_HEAT
      run(cool, 12, 30, seeded(14))
      run(warm, 12, 30, seeded(15), warmth)
      let worst = 0
      run(hot, 4, 30, seeded(16), 50, () => {
        for (let i = 0; i < 1000; i++) worst = Math.max(worst, Math.abs(hot.x[i]), Math.abs(hot.y[i]))
      })

      const ratio = rms(warm.x) / rms(cool.x)
      expect(ratio).toBeGreaterThan(1.3)
      expect(ratio).toBeLessThan(Math.sqrt(warmth) + 0.2)
      expect(worst).toBeLessThanOrEqual(BROWNIAN_MAX)
    })

    it('treats a non-positive step as a pause and caps long steps', () => {
      expect(brownianStep(0)).toEqual({ dt: 0, decay: 1, kick: 0 })
      expect(brownianStep(-0.2).dt).toBe(0)
      expect(brownianStep(10)).toEqual(brownianStep(BROWNIAN_MAX_DT))

      const field = resizeBrownianField(null, 3, 3, seeded(17))
      const snapshot = Array.from(field.x)
      stepBrownianDot(field, 4, brownianStep(0), 1, seeded(18))
      expect(Array.from(field.x)).toEqual(snapshot)
    })
  })

  describe('calcTrailOffset', () => {
    it('returns zero without sufficient speed, influence, or a positive limit', () => {
      for (const [vx, vy, influence, maxTrail] of [
        [0, 0, 1, 2.4],
        [0.001, 0, 1, 2.4],
        [0, -0.0005, 1, 2.4],
        [10, 10, 0, 2.4],
        [10, 10, -1, 2.4],
        [10, 10, 1, 0],
        [10, 10, 1, -1],
      ]) {
        expect(calcTrailOffset(vx, vy, influence, maxTrail)).toEqual({ x: 0, y: 0 })
      }
    })

    it('points in the velocity direction in every quadrant and along each axis', () => {
      for (const [vx, vy] of [[3, 4], [-3, 4], [3, -4], [-3, -4], [14, 0], [0, -14]]) {
        const offset = calcTrailOffset(vx, vy, 1)
        expect(offset.x * vx + offset.y * vy).toBeGreaterThan(0)
        expect(offset.x * vy - offset.y * vx).toBeCloseTo(0, 10)
      }
    })

    it('stays finite and respects the magnitude limit for influences from 0 to 1', () => {
      for (const [vx, vy] of [[0, 0], [1e-12, -1e-12], [3, 4], [-100, 200], [1e6, -1e6]]) {
        for (const influence of [0, 0.25, 0.5, 1]) {
          for (const maxTrail of [0, 0.1, 2.4, 6]) {
            const offset = calcTrailOffset(vx, vy, influence, maxTrail)
            expect(Number.isFinite(offset.x)).toBe(true)
            expect(Number.isFinite(offset.y)).toBe(true)
            expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(maxTrail + 1e-12)
          }
        }
      }
    })

    it('increases with speed until capped and scales with influence', () => {
      const slow = calcTrailOffset(7, 0, 1)
      const fast = calcTrailOffset(14, 0, 1)
      expect(slow.x).toBeGreaterThan(0)
      expect(slow.x).toBeLessThan(fast.x)
      expect(fast.x).toBeCloseTo(2.4, 10)
      expect(calcTrailOffset(140, 0, 1).x).toBeCloseTo(fast.x, 10)
      expect(calcTrailOffset(14, 0, 0.5).x).toBeCloseTo(fast.x / 2, 10)
      expect(calcTrailOffset(140, 0, 1, 0.5).x).toBeCloseTo(0.5, 10)
    })
  })
})
