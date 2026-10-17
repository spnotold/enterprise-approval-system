import { describe, expect, it } from 'vitest'
import type { FormField, NodeDef } from '@/lib/types'
import { RESERVED_KEYS, approverRuleProblem, fieldProblems, nodeProblems } from './utils'

// 与后端 TemplatePublishValidator 口径一致的本地校验

describe('approverRuleProblem', () => {
  it('部门负责人规则只支持单人审批', () => {
    expect(approverRuleProblem({ type: 'APPLICANT_DEPT_HEAD' }, 'SINGLE')).toBeNull()
    expect(approverRuleProblem({ type: 'APPLICANT_DEPT_HEAD' }, 'COUNTERSIGN')).toMatch('仅支持单人审批')
    expect(approverRuleProblem({ type: 'APPLICANT_DEPT_HEAD' }, 'OR_SIGN')).toMatch('仅支持单人审批')
  })
})

describe('nodeProblems', () => {
  const node = (fallbackRule: NodeDef['fallbackRule']): NodeDef =>
    ({
      nodeKey: 'N1',
      name: '审批',
      mode: 'COUNTERSIGN',
      approverRule: { type: 'SPECIFIED_USER', userIds: [1, 2] },
      fallbackRule,
    }) as NodeDef

  it('替代规则固定按单人校验，不随节点模式变化', () => {
    expect(nodeProblems(node({ type: 'SPECIFIED_USER', userIds: [3, 4] }), []).fallbackRule).toEqual(['请选择审批人'])
    expect(nodeProblems(node({ type: 'SPECIFIED_USER', userId: 3 }), []).fallbackRule).toBeUndefined()
  })
})

describe('fieldProblems', () => {
  const radio = (value: string): FormField =>
    ({
      key: 'kind',
      label: '类别',
      type: 'RADIO',
      options: [
        { label: '甲', value },
        { label: '乙', value: 'B' },
      ],
    }) as FormField

  it('选项值不能有首尾空格', () => {
    const f = radio(' A ')
    expect(fieldProblems(f, 0, [f])['options[0]']?.[0]).toMatch('首尾空格')
    const ok = radio('A')
    expect(fieldProblems(ok, 0, [ok])['options[0]']).toBeUndefined()
  })

  it('保留字覆盖后端的全部保留字段名', () => {
    const lower = RESERVED_KEYS.map((k) => k.toLowerCase())
    for (const k of ['applicationId', 'templateVersionId', 'finishedAt', 'constructor', 'prototype']) {
      expect(lower).toContain(k.toLowerCase())
    }
  })
})
