import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compactRows,
  emptyExpenseItem,
  emptyQuote,
  expensePairRuleErrors,
  isEmptyQuote,
  purchasePairRuleErrors,
  quoteDateError,
  quoteFromView,
  quoteToInput,
  remarkError,
  trimOrNull,
  type ExpenseItemDraft,
  type QuoteDraft,
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

// 成对字段约束（V5 迁移后草稿允许暂缺，仅提交时校验）：线上报价需购买链接、
// 单一来源需说明（≥20 字）、无票明细需原因（≥10 字）。见 BusinessValidator 的 full 分支。

const quote = (channel: QuoteDraft['channel'], url: string | null): QuoteDraft => ({
  ...emptyQuote(),
  supplierName: '供应商A',
  channel,
  quoteAmountCents: 12000,
  url,
  description: '含税包邮',
})

const purchaseModel = (quotes: QuoteDraft[], singleSource: boolean, singleSourceReason: string | null) => ({
  singleSource,
  singleSourceReason,
  quotes,
})

const noInvoiceItem = (noInvoiceReason: string | null): ExpenseItemDraft => ({
  ...emptyExpenseItem(),
  expenseTypeCode: 'OFFICE',
  occurDate: today,
  purpose: '购置文具',
  amountCents: 10000,
  noInvoice: true,
  noInvoiceReason,
})

describe('purchasePairRuleErrors', () => {
  it('线上报价缺购买链接：草稿通过，提交报错', () => {
    const m = purchaseModel([quote('ONLINE', null)], false, null)
    expect(purchasePairRuleErrors(m, false)).toEqual({})
    expect(purchasePairRuleErrors(m, true)).toEqual({ 'quotes[0].url': '线上报价必须填写购买链接' })
  })

  it('线下报价不带链接：草稿与提交均通过', () => {
    const m = purchaseModel([quote('OFFLINE', null)], false, null)
    expect(purchasePairRuleErrors(m, false)).toEqual({})
    expect(purchasePairRuleErrors(m, true)).toEqual({})
  })

  it('单一来源缺说明：草稿通过，提交报错', () => {
    const m = purchaseModel([quote('OFFLINE', null)], true, null)
    expect(purchasePairRuleErrors(m, false)).toEqual({})
    expect(purchasePairRuleErrors(m, true)).toEqual({
      singleSourceReason: '单一来源采购需说明原因（至少 20 字），并附说明材料或写明依据',
    })
  })

  it('单一来源说明不足 20 字提交仍报错，满 20 字通过', () => {
    const short = purchaseModel([quote('OFFLINE', null)], true, '不足二十字')
    expect(purchasePairRuleErrors(short, true).singleSourceReason).toBeTruthy()
    const ok = purchaseModel([quote('OFFLINE', null)], true, '该供应商为独家代理，无可替代渠道，附说明材料。')
    expect(purchasePairRuleErrors(ok, true)).toEqual({})
  })

  it('全空报价行不触发线上链接检查', () => {
    const m = purchaseModel([emptyQuote()], false, null)
    expect(purchasePairRuleErrors(m, true)).toEqual({})
  })
})

describe('expensePairRuleErrors', () => {
  it('无票明细缺原因：草稿通过，提交报错', () => {
    const items = [noInvoiceItem(null)]
    expect(expensePairRuleErrors(items, false)).toEqual({})
    expect(expensePairRuleErrors(items, true)).toEqual({
      'items[0].noInvoiceReason': '勾选无票时需填写原因（至少 10 字）',
    })
  })

  it('无票原因不足 10 字提交仍报错，满 10 字通过', () => {
    expect(expensePairRuleErrors([noInvoiceItem('太短')], true)['items[0].noInvoiceReason']).toBeTruthy()
    expect(expensePairRuleErrors([noInvoiceItem('说明本次遗失票据的详细原因')], true)).toEqual({})
  })

  it('未勾选无票的行不检查原因', () => {
    const item = { ...noInvoiceItem(null), noInvoice: false }
    expect(expensePairRuleErrors([item], true)).toEqual({})
  })
})
