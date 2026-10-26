// 工作台的显示格式：日期行、按天的相对时间、发起申请入口的简短说明
import type { TemplateOption } from '@/lib/types'
import { diffDays, fmtDate, fromNow, todayShanghai } from '@/lib/datetime'

/** 2026-10-20 -> 10 月 20 日 星期二 */
export function dateLine(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const week = '日一二三四五六'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${m} 月 ${d} 日 星期${week}`
}

/** 一天内同 fromNow（刚刚、5 分钟前、昨天 09:41）；2 到 30 天写「3 天前」；更早写日期 */
export function ago(input: string | null | undefined, now: number = Date.now()): string {
  const t = input ? Date.parse(input) : NaN
  if (Number.isNaN(t)) return fromNow(input, now)
  const days = diffDays(todayShanghai(t), todayShanghai(now))
  if (days < 2) return fromNow(input, now)
  return days <= 30 ? `${days} 天前` : fmtDate(input)
}

/** 入口说明最多 8 个字，保证五列入口在 1440px 下一行显示 */
export const SHORT_DESC_MAX = 8

const BUILTIN_SHORT: Partial<Record<TemplateOption['bizType'], string>> = {
  PURCHASE: '采购明细与报价',
  TRAVEL: '出差行程与预算',
  EXPENSE: '费用明细与票据',
}

/**
 * 入口的简短说明，不超过 8 个字，不加省略号：
 * 内置类型用固定文字；其余取模板说明的第一句，仍太长时从后往前去掉「、」分项，都不行就不显示。
 */
export function shortDesc(t: Pick<TemplateOption, 'category' | 'bizType' | 'description'>): string | null {
  if (t.category === 'BUILTIN' && BUILTIN_SHORT[t.bizType]) return BUILTIN_SHORT[t.bizType]!
  const first = (t.description ?? '').split(/[；;，,。.！!？?\n]/)[0].trim().replace(/^使用公司/, '')
  if (!first) return null
  const parts = first.split('、')
  while (parts.length) {
    const text = parts.join('、').replace(/等$/, '')
    if ([...text].length <= SHORT_DESC_MAX) return text
    parts.pop()
  }
  return null
}

export type ApplyIllustrationKey = 'purchase' | 'travel' | 'expense' | 'leave' | 'seal' | 'generic'

/** 根据模板类型、编码与名称匹配对应的套色插画键名 */
export function resolveApplyIllustrationKey(
  t: Pick<TemplateOption, 'bizType' | 'code' | 'name'>,
): ApplyIllustrationKey {
  if (t.bizType === 'PURCHASE') return 'purchase'
  if (t.bizType === 'TRAVEL') return 'travel'
  if (t.bizType === 'EXPENSE') return 'expense'
  const code = (t.code ?? '').toUpperCase()
  const name = t.name ?? ''
  const codeParts = code.split(/[^A-Z0-9]+/)
  if (codeParts.includes('LEAVE') || name.includes('请假') || name.includes('休假')) {
    return 'leave'
  }
  if (
    codeParts.includes('SEAL') ||
    codeParts.includes('STAMP') ||
    name.includes('用章') ||
    name.includes('印章') ||
    name.includes('盖章')
  ) {
    return 'seal'
  }
  if (codeParts.includes('PURCHASE') || name.includes('采购')) return 'purchase'
  if (codeParts.includes('TRAVEL') || name.includes('差旅') || name.includes('出差')) return 'travel'
  if (codeParts.includes('EXPENSE') || name.includes('报销')) return 'expense'
  return 'generic'
}
