import type { TemplateOption } from '@/lib/types'

export type ApplyIllustrationKey = 'purchase' | 'travel' | 'expense' | 'leave' | 'seal' | 'generic'

/** 编码分段 → 插画；按顺序匹配，排在前面的更具体 */
const CODE_RULES: [ApplyIllustrationKey, string[]][] = [
  ['leave', ['LEAVE']],
  ['seal', ['SEAL', 'STAMP']],
  ['expense', ['EXPENSE', 'REIMBURSE', 'REIMBURSEMENT']],
  ['travel', ['TRAVEL', 'TRIP']],
  ['purchase', ['PURCHASE', 'PROCUREMENT']],
]

/** 名称关键词 → 插画；「报销」排在「差旅」「采购」前面，「差旅报销」「采购报销」都算报销 */
const NAME_RULES: [ApplyIllustrationKey, string[]][] = [
  ['leave', ['请假', '休假']],
  ['seal', ['用章', '印章', '盖章']],
  ['expense', ['报销']],
  ['travel', ['差旅', '出差']],
  ['purchase', ['采购']],
]

/** 根据模板类型、编码与名称匹配对应的套色插画键名：先看业务类型，再看编码，最后看名称 */
export function resolveApplyIllustrationKey(
  t: Pick<TemplateOption, 'bizType' | 'code' | 'name'>,
): ApplyIllustrationKey {
  if (t.bizType === 'PURCHASE') return 'purchase'
  if (t.bizType === 'TRAVEL') return 'travel'
  if (t.bizType === 'EXPENSE') return 'expense'
  const codeParts = (t.code ?? '').toUpperCase().split(/[^A-Z0-9]+/)
  for (const [key, words] of CODE_RULES) if (words.some((w) => codeParts.includes(w))) return key
  const name = t.name ?? ''
  for (const [key, words] of NAME_RULES) if (words.some((w) => name.includes(w))) return key
  return 'generic'
}

/** 返回对应模板的插画静态路径 */
export function applyIllustrationUrl(t: Pick<TemplateOption, 'bizType' | 'code' | 'name'>): string {
  const key = resolveApplyIllustrationKey(t)
  return `/static/illustrations/apply-${key}.jpg`
}

export const resolveApplyIllustrationUrl = applyIllustrationUrl
