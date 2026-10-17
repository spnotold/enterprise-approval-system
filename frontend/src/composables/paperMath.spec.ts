import { describe, expect, it } from 'vitest'
import {
  RIPPLE_MAX_AMPLITUDE,
  calcDotInfluence,
  calcDotOffset,
  calcDotRadius,
  easeCursor,
  interpolateRgba,
  isSettled,
  parseHexColor,
  rippleAmplitude,
  rippleEmphasis,
  rippleOffset,
  rippleRadius,
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
    it('decays linearly from 5px to 0 over 1000ms', () => {
      expect(rippleAmplitude(0)).toBe(RIPPLE_MAX_AMPLITUDE)
      expect(rippleAmplitude(250)).toBeCloseTo(3.75, 5)
      expect(rippleAmplitude(500)).toBeCloseTo(2.5, 5)
      expect(rippleAmplitude(1000)).toBe(0)
      expect(rippleAmplitude(1500)).toBe(0)
    })
  })

  describe('rippleOffset', () => {
    // t = 500 → 波前 r = 120px，振幅 A = 2.5px
    const r = 120
    const t = 500
    const amp = 2.5
    const lambda = 36
    const sigma = 48

    it('is zero outside the wave (d > r) or after the ripple ends (t >= 1000)', () => {
      expect(rippleOffset(200, 100, 200)).toBe(0)
      expect(rippleOffset(10, 0, 0)).toBe(0)
      expect(rippleOffset(0, 240, 1000)).toBe(0)
      expect(rippleOffset(0, 240, 1200)).toBe(0)
    })

    it('crosses zero at the wavefront and every half wavelength behind it', () => {
      expect(rippleOffset(r, r, t)).toBeCloseTo(0, 10)
      expect(rippleOffset(r - lambda / 2, r, t)).toBeCloseTo(0, 10)
      expect(rippleOffset(r - lambda, r, t)).toBeCloseTo(0, 10)
    })

    it('pushes outward at a quarter wavelength behind the front', () => {
      const phase = lambda / 4
      const expected = amp * Math.sin(Math.PI / 2) * Math.exp(-((phase / sigma) ** 2))
      expect(rippleOffset(r - phase, r, t)).toBeCloseTo(expected, 5)
      expect(rippleOffset(r - phase, r, t)).toBeGreaterThan(0)
    })

    it('pulls inward at three quarters of a wavelength behind the front', () => {
      const phase = (3 * lambda) / 4
      const expected = amp * Math.sin((3 * Math.PI) / 2) * Math.exp(-((phase / sigma) ** 2))
      expect(rippleOffset(r - phase, r, t)).toBeCloseTo(expected, 5)
      expect(rippleOffset(r - phase, r, t)).toBeLessThan(0)
    })

    it('starts non-zero just behind the wavefront', () => {
      expect(rippleOffset(r - 1, r, t)).toBeGreaterThan(0)
      expect(rippleOffset(r + 0.001, r, t)).toBe(0)
    })

    it('keeps the same phase shape but decays with time', () => {
      const phase = 12
      const early = rippleOffset(60 - phase, 60, 250)
      const late = rippleOffset(120 - phase, 120, 500)
      expect(early / late).toBeCloseTo(1.5, 6)
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
})
