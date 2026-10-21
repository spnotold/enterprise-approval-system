import { describe, expect, it } from 'vitest'
import { centsToYuan, formatCents, formatQuantity, MAX_ITEM_CENTS, multiplyCents, sumCents, yuanToCents } from './money'

describe('yuanToCents', () => {
  it.each([
    ['12.3', 1230],
    ['12.30', 1230],
    ['12', 1200],
    ['0.1', 10],
    ['0.01', 1],
    ['0.10', 10],
    ['0', 0],
    ['0.00', 0],
    ['00012.3', 1230],
    ['  12.5  ', 1250],
    ['100000', MAX_ITEM_CENTS],
    ['100000.01', MAX_ITEM_CENTS + 1],
    ['999999999.99', 99_999_999_999],
  ])('%j -> %d', (input, expected) => {
    expect(yuanToCents(input)).toBe(expected)
  })

  it.each([
    '',
    '   ',
    '.',
    '.5',
    '12.',
    '12.345',
    '0.001',
    '-1',
    '+1',
    '1e3',
    '1,000',
    '1 000',
    'abc',
    '12.3.4',
    '1234567890', // 超过 9 位整数
    '０.１', // 全角
    'NaN',
    'Infinity',
  ])('rejects %j', (input) => {
    expect(yuanToCents(input)).toBeNull()
  })

  it('does not suffer from float error (T07: 0.10 + 0.20 = 0.30)', () => {
    const a = yuanToCents('0.10')!
    const b = yuanToCents('0.20')!
    expect(a + b).toBe(30)
    expect(centsToYuan(a + b)).toBe('0.30')
  })

  it('handles values whose float representation is inexact', () => {
    // 1.005 * 100 在浮点下为 100.49999...，字符串解析不受影响
    expect(yuanToCents('1.00')).toBe(100)
    expect(yuanToCents('19.99')).toBe(1999)
    expect(yuanToCents('4.35')).toBe(435)
    expect(yuanToCents('1.15')).toBe(115)
  })
})

describe('centsToYuan', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [5, '0.05'],
    [10, '0.10'],
    [99, '0.99'],
    [100, '1.00'],
    [1230, '12.30'],
    [MAX_ITEM_CENTS, '100000.00'],
    [99_999_999_999, '999999999.99'],
    [-5, '-0.05'],
    [-1230, '-12.30'],
  ])('%d -> %j', (cents, expected) => {
    expect(centsToYuan(cents)).toBe(expected)
  })

  it('round-trips with yuanToCents', () => {
    for (const c of [0, 1, 9, 10, 99, 100, 101, 1999, 123456, MAX_ITEM_CENTS]) {
      expect(yuanToCents(centsToYuan(c))).toBe(c)
    }
  })
})

describe('formatCents', () => {
  it.each([
    [0, '0.00'],
    [99, '0.99'],
    [100000, '1,000.00'],
    [1234567, '12,345.67'],
    [100000000, '1,000,000.00'],
    [99_999_999_999, '999,999,999.99'],
    [-1234567, '-12,345.67'],
    [-5, '-0.05'],
  ])('%d -> %j', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected)
  })

  it('shows a dash for empty values', () => {
    expect(formatCents(null)).toBe('—')
    expect(formatCents(undefined)).toBe('—')
  })
})

describe('formatQuantity', () => {
  it.each([
    ['1.000', '1'],
    ['2.500', '2.5'],
    ['0.250', '0.25'],
    ['10', '10'],
    ['100.000', '100'],
    [' 2.050 ', '2.05'],
  ])('%j -> %j', (quantity, expected) => {
    expect(formatQuantity(quantity)).toBe(expected)
  })

  it('shows a dash for empty values and preserves unexpected text', () => {
    expect(formatQuantity(null)).toBe('—')
    expect(formatQuantity(undefined)).toBe('—')
    expect(formatQuantity('  ')).toBe('—')
    expect(formatQuantity('abc')).toBe('abc')
  })
})

describe('multiplyCents', () => {
  it.each<[string, number, number]>([
    ['2', 1050, 2100],
    ['1', 1, 1],
    ['0', 999, 0],
    ['3', 0, 0],
    ['1.5', 333, 500], // 499.5 -> HALF_UP -> 500
    ['1.5', 331, 497], // 496.5 -> 497
    ['0.001', 499, 0], // 0.499 -> 0
    ['0.001', 500, 1], // 0.5 -> 1
    ['0.333', 3, 1], // 0.999 -> 1
    ['2.25', 1999, 4498], // 4497.75 -> 4498
    [' 2 ', 100, 200],
    ['1000000', MAX_ITEM_CENTS, 10_000_000_000_000],
  ])('%j x %d -> %d', (q, price, expected) => {
    expect(multiplyCents(q, price)).toBe(expected)
  })

  it('stays exact up to Number.MAX_SAFE_INTEGER', () => {
    // 999999999.999 × 9007199 = 9,007,198,999,990,992.801 -> 9007198999990993（仍在安全范围内）
    expect(multiplyCents('999999999.999', 9007199)).toBe(9_007_198_999_990_993)
  })

  it.each<[string, number]>([
    ['999999999.001', 9999999], // 结果超过 MAX_SAFE_INTEGER
    ['999999999.999', Number.MAX_SAFE_INTEGER],
    ['1', Number.MAX_SAFE_INTEGER + 1], // 单价不是安全整数
    ['1', -100], // 负单价
    ['1', 1.5], // 单价不是整数
    ['1', Number.NaN],
    ['1', Number.POSITIVE_INFINITY],
  ])('returns null for unsafe input %j x %d', (q, price) => {
    expect(multiplyCents(q, price)).toBeNull()
  })

  it('returns the max safe integer itself when exactly reachable', () => {
    expect(multiplyCents('1', Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
  })

  it.each<[string | null, number | null]>([
    [null, 100],
    ['1', null],
    ['', 100],
    ['1.2345', 100], // 超过 3 位小数
    ['-1', 100],
    ['abc', 100],
    ['1.', 100],
    ['.5', 100],
  ])('returns null for %j x %j', (q, price) => {
    expect(multiplyCents(q, price)).toBeNull()
  })
})

describe('sumCents', () => {
  it('sums integer cents, treating empty as 0', () => {
    expect(sumCents([10, 20, null, undefined])).toBe(30)
    expect(sumCents([])).toBe(0)
  })
})
