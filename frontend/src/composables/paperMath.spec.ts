import { describe, expect, it } from 'vitest'
import {
  calcDotInfluence,
  calcDotOffset,
  calcDotRadius,
  calcRippleProgress,
  easeCursor,
  interpolateRgba,
  isSettled,
  parseHexColor,
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

  describe('calcRippleProgress', () => {
    it('computes ripple radius expanding to 90px and alpha fading to 0 over 500ms', () => {
      const start = calcRippleProgress(0, 500, 90, 0.25)
      expect(start.radius).toBe(0)
      expect(start.alpha).toBe(0.25)
      expect(start.done).toBe(false)

      const mid = calcRippleProgress(250, 500, 90, 0.25)
      expect(mid.radius).toBe(45)
      expect(mid.alpha).toBeCloseTo(0.125, 3)
      expect(mid.done).toBe(false)

      const end = calcRippleProgress(500, 500, 90, 0.25)
      expect(end.radius).toBe(90)
      expect(end.alpha).toBe(0)
      expect(end.done).toBe(true)
    })
  })
})
