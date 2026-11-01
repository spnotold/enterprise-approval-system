import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compactRows, emptyQuote, isEmptyQuote, quoteDateError, quoteFromView, quoteToInput, remarkError, trimOrNull,
} from './formModels'

const today = '2026-11-01'
afterEach(() => vi.useRealTimers())

describe('purchase quote dates', () => {
  it('preserves a quote date through detail loading and request serialization', () => {
    const input = { ...quoteToInput(emptyQuote()), supplierName: '供应商', quoteDate: today }
    const draft = quoteFromView({ ...input, attachments: [], lowest: true })
    expect(quoteToInput(draft)).toEqual(input)
    expect(draft.lowest).toBe(true)
  })

  it('retains date-only rows and their original indices when compacting empty quotes', () => {
    const blank = emptyQuote(), dated = { ...emptyQuote(), quoteDate: today }
    expect(isEmptyQuote(blank)).toBe(true)
    const compact = compactRows([blank, dated], isEmptyQuote)
    expect(compact.map).toEqual([1])
    expect(compact.kept.map(quoteToInput)[0].quoteDate).toBe(today)
  })

  it('allows incomplete and future dates in drafts while submit rejects them', () => {
    vi.useFakeTimers().setSystemTime('2026-11-01T04:00:00Z')
    for (const value of [null, '2026-11-02']) {
      expect(quoteDateError(value, false)).toBeUndefined()
      expect(quoteDateError(value, true)).toBeTruthy()
    }
    for (const value of ['2026-10-01', today]) expect(quoteDateError(value, true)).toBeUndefined()
    expect(quoteDateError('2026-02-30', true)).toBeTruthy()
  })

  it('changes the allowed date at Shanghai midnight', () => {
    vi.useFakeTimers().setSystemTime('2026-10-31T15:59:59Z')
    expect(quoteDateError(today, true)).toBeTruthy()
    vi.advanceTimersByTime(1000)
    expect(quoteDateError(today, true)).toBeUndefined()
    expect(quoteDateError('2026-11-02', true)).toBeTruthy()
  })
})

describe('optional purchase and expense remarks', () => {
  it('allows empty remarks and normalizes blank request values to null', () => {
    for (const value of [null, '', '  ']) {
      expect(remarkError(value)).toBeUndefined()
      expect(trimOrNull(value)).toBeNull()
    }
    expect(trimOrNull('  收货前联系  ')).toBe('收货前联系')
  })

  it('accepts 500 characters and rejects 501 for either draft or submit', () => {
    expect(remarkError('备'.repeat(500))).toBeUndefined()
    expect(remarkError('备'.repeat(501))).toBeTruthy()
    expect(remarkError(' '.repeat(501))).toBeTruthy()
  })
})
