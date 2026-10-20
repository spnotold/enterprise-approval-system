import { describe, expect, it } from 'vitest'
import { ago, dateLine, shortDesc, SHORT_DESC_MAX } from './format'

describe('dateLine', () => {
  it('writes month, day and weekday without the year', () => {
    expect(dateLine('2026-10-20')).toBe('10 月 20 日 星期二')
    expect(dateLine('2026-11-01')).toBe('11 月 1 日 星期日')
  })
})

describe('ago', () => {
  // 2026-10-20 20:00 上海时间
  const now = Date.parse('2026-10-20T20:00:00+08:00')

  it('keeps fromNow within a day', () => {
    expect(ago('2026-10-20T19:59:30+08:00', now)).toBe('刚刚')
    expect(ago('2026-10-20T19:15:00+08:00', now)).toBe('45 分钟前')
    expect(ago('2026-10-20T08:00:00+08:00', now)).toBe('12 小时前')
    expect(ago('2026-10-19T09:41:00+08:00', now)).toBe('昨天 09:41')
  })

  it('counts calendar days in Shanghai time', () => {
    expect(ago('2026-10-18T23:59:00+08:00', now)).toBe('2 天前')
    expect(ago('2026-10-17T09:41:00+08:00', now)).toBe('3 天前')
    // UTC 前一天、上海当天 00:30
    expect(ago('2026-10-16T16:30:00Z', now)).toBe('3 天前')
    expect(ago('2026-09-20T10:00:00+08:00', now)).toBe('30 天前')
  })

  it('falls back to the date after 30 days and to a dash when missing', () => {
    expect(ago('2026-09-19T10:00:00+08:00', now)).toBe('2026-09-19')
    expect(ago(null, now)).toBe('—')
    expect(ago('not a date', now)).toBe('—')
  })
})

describe('shortDesc', () => {
  const custom = (description: string | null) => ({ category: 'CUSTOM' as const, bizType: 'CUSTOM' as const, description })

  it('uses fixed text for builtin types', () => {
    expect(shortDesc({ category: 'BUILTIN', bizType: 'PURCHASE', description: '采购明细、至少两家报价比较、采购选择' })).toBe(
      '采购明细与报价',
    )
    expect(shortDesc({ category: 'BUILTIN', bizType: 'TRAVEL', description: null })).toBe('行程、预算、同行人员')
    expect(shortDesc({ category: 'BUILTIN', bizType: 'EXPENSE', description: null })).toBe('费用明细与票据')
  })

  it('takes the first clause and drops trailing items until it fits', () => {
    expect(shortDesc(custom('事假、病假、年假等；超过 3 天需企业负责人审批'))).toBe('事假、病假、年假')
    expect(shortDesc(custom('使用公司公章、合同章、财务章'))).toBe('使用公司公章、合同章')
    expect(shortDesc(custom('会议室预订'))).toBe('会议室预订')
  })

  it('returns null instead of truncating', () => {
    expect(shortDesc(custom(null))).toBeNull()
    expect(shortDesc(custom('  '))).toBeNull()
    expect(shortDesc(custom('一个非常非常非常长而且没有任何分隔的说明'))).toBeNull()
  })

  it('never exceeds the limit', () => {
    const samples = ['甲乙丙丁、戊己庚辛壬癸、子丑寅卯', '一二三四五六七八九十', '一二三四五六七八九十一']
    for (const s of samples) {
      const text = shortDesc(custom(s))
      if (text) expect([...text].length).toBeLessThanOrEqual(SHORT_DESC_MAX)
    }
  })
})
