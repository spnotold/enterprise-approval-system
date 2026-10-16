import { describe, expect, it } from 'vitest'
import { validateFormValues } from './formSchema'
import type { FormSchema } from './types'

function numberSchema(precision?: number): FormSchema {
  return {
    fields: [
      {
        key: 'days',
        label: '天数',
        type: 'NUMBER',
        required: true,
        ...(precision === undefined ? {} : { rules: { precision } }),
      },
    ],
  }
}

function errors(schema: FormSchema, value: unknown): Record<string, string> {
  return validateFormValues(schema, { days: value }, { full: true })
}

describe('NUMBER 字段缺省精度', () => {
  it.each(['0.5', '3.5', '0.0001', '12'])('未配置 precision 时 %s 通过', (value) => {
    expect(errors(numberSchema(), value)).toEqual({})
  })

  it.each(['0.00001', '1.23456'])('未配置 precision 时 %s 超过 4 位小数被拒', (value) => {
    expect(errors(numberSchema(), value)).toEqual({ 'formValues.days': '天数最多 4 位小数' })
  })

  it('显式配置 precision: 0 时仍要求整数', () => {
    expect(errors(numberSchema(0), '0.5')).toEqual({ 'formValues.days': '天数必须是整数' })
    expect(errors(numberSchema(0), '5')).toEqual({})
  })

  it('显式配置 precision: 1 时最多 1 位小数', () => {
    expect(errors(numberSchema(1), '0.5')).toEqual({})
    expect(errors(numberSchema(1), '0.55')).toEqual({ 'formValues.days': '天数最多 1 位小数' })
  })
})
