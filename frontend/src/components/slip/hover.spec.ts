import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSlipHover } from './hover'

describe('slip hover', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('falls back to the focused cell when the pointer leaves', () => {
    const hover = createSlipHover()
    hover.enter('1', 'bar', 'focus')
    hover.enter('2', 'bar', 'pointer')
    expect(hover.key.value).toBe('2')
    hover.leave('2', 'pointer')
    vi.runAllTimers()
    expect(hover.key.value).toBe('1')
    expect(hover.source.value).toBe('bar')
  })

  it('keeps focus linkage when hovering another source and leaving it', () => {
    const hover = createSlipHover()
    hover.enter('1', 'bar', 'focus')
    hover.enter('3', 'flow', 'pointer')
    expect(hover.source.value).toBe('flow')
    hover.leave('3', 'pointer')
    vi.runAllTimers()
    expect(hover.key.value).toBe('1')
  })

  it('does not drop the pointer target when moving into its popover within the grace period', () => {
    const hover = createSlipHover()
    hover.enter('2', 'bar', 'pointer')
    hover.leave('2', 'pointer')
    vi.advanceTimersByTime(60)
    hover.enter('2', 'bar', 'pointer')
    vi.runAllTimers()
    expect(hover.key.value).toBe('2')
  })

  it('ignores stale leave events from other keys', () => {
    const hover = createSlipHover()
    hover.enter('1', 'flow', 'focus')
    hover.leave('2', 'focus')
    expect(hover.key.value).toBe('1')
  })

  it('releases state left by unmounted content', () => {
    const hover = createSlipHover()
    hover.enter('1', 'bar', 'focus')
    hover.enter('2', 'flow', 'pointer')
    hover.release('flow')
    expect(hover.key.value).toBe('1')
    hover.release('bar', (key) => key === '1')
    expect(hover.key.value).toBe('1')
    hover.release('bar')
    expect(hover.key.value).toBeNull()
  })
})
