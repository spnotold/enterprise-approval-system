// 自定义表单（FormSchema）的前端校验与版本切换时的取值合并。以服务端 FormSchemaValidator 为准。
import type { FieldError, FormField, FormSchema } from '@/lib/types'
import { compareDecimal, decimalPlaces, decimalUnits, isDecimal } from './decimal'
import { compareDate, isDateString, resolveDateExpr } from './time'
import { formatCents } from '@/lib/money'

const MOBILE = /^1[3-9]\d{9}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length)
}

/** 新建表单时的初始值 */
export function emptyValue(f: FormField): unknown {
  return f.type === 'ATTACHMENT' ? [] : null
}

export function initialValues(schema: FormSchema): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  for (const f of schema.fields) r[f.key] = emptyValue(f)
  return r
}

/**
 * 模板升级后按新版本重新渲染：同名且同类型的字段保留原值，其余清空。
 * 返回被丢弃的字段名，便于提示用户。
 */
export function mergeValues(
  oldSchema: FormSchema | null,
  oldValues: Record<string, unknown>,
  next: FormSchema,
): { values: Record<string, unknown>; dropped: string[] } {
  const values = initialValues(next)
  const dropped: string[] = []
  for (const f of next.fields) {
    const prev = oldSchema?.fields.find((x) => x.key === f.key)
    if (prev && prev.type === f.type && !isEmpty(oldValues[f.key])) {
      const v = oldValues[f.key]
      if (f.type === 'RADIO' && !f.options?.some((o) => o.value === v)) {
        dropped.push(f.label)
        continue
      }
      values[f.key] = v
    }
  }
  for (const f of oldSchema?.fields ?? []) {
    if (isEmpty(oldValues[f.key])) continue
    const kept = next.fields.find((x) => x.key === f.key && x.type === f.type)
    if (!kept) dropped.push(f.label)
  }
  return { values, dropped }
}

/** 提交前的前端校验，规则与模板配置一致 */
export function validateCustom(schema: FormSchema, values: Record<string, unknown>, opts: { full?: boolean } = {}): FieldError[] {
  const errors: FieldError[] = []
  const add = (f: FormField, message: string) => errors.push({ field: f.key, rule: 'CLIENT', message })
  for (const f of schema.fields) {
    const v = values[f.key]
    const rules = f.rules ?? {}
    if (isEmpty(v)) {
      if (f.required && opts.full !== false) {
        const verb = f.type === 'ATTACHMENT' ? '请上传' : f.type === 'RADIO' || f.type === 'DATE' ? '请选择' : '请填写'
        add(f, `${verb}${f.label}`)
      }
      continue
    }
    switch (f.type) {
      case 'TEXT':
      case 'TEXTAREA': {
        if (typeof v !== 'string') { add(f, `${f.label}格式不正确`); break }
        const s = v.trim(), length = [...s].length
        const maximum = Math.min(rules.maxLength ?? (f.type === 'TEXT' ? 200 : 2000), f.type === 'TEXT' ? 200 : 2000)
        if (length > maximum) { add(f, `${f.label}不能超过 ${maximum} 个字`); break }
        if (opts.full === false) break
        if (rules.minLength && length < rules.minLength) add(f, `${f.label}至少 ${rules.minLength} 个字`)
        else if (rules.patternPreset === 'MOBILE' && !MOBILE.test(s)) add(f, `${f.label}不是有效的手机号`)
        else if (rules.patternPreset === 'EMAIL' && !EMAIL.test(s)) add(f, `${f.label}不是有效的邮箱`)
        else if (rules.pattern) {
          try {
            if (!new RegExp(rules.pattern).test(s)) add(f, rules.patternMessage || `${f.label}格式不正确`)
          } catch {
            // 正则无法在客户端编译时交给服务端校验
          }
        }
        break
      }
      case 'NUMBER': {
        const s = String(v).trim()
        if (!isDecimal(s)) {
          add(f, `${f.label}必须是数字`)
          break
        }
        const precision = rules.precision ?? 4 // 与服务端一致：未配置精度时最多 4 位小数
        if (decimalPlaces(s) > precision) { add(f, precision === 0 ? `${f.label}必须是整数` : `${f.label}最多 ${precision} 位小数`); break }
        if (opts.full === false) break
        if (rules.min && (compareDecimal(s, rules.min) ?? 0) < 0) add(f, `${f.label}不能小于 ${rules.min}`)
        else if (rules.max && (compareDecimal(s, rules.max) ?? 0) > 0) add(f, `${f.label}不能大于 ${rules.max}`)
        else {
          const value = decimalUnits(s), step = decimalUnits(rules.step), base = decimalUnits(rules.min) ?? 0n
          if (value !== null && step !== null && step > 0n && (value - base) % step !== 0n) add(f, `${f.label}须按 ${rules.step} 递增`)
        }
        break
      }
      case 'AMOUNT': {
        const c = typeof v === 'number' ? v : null
        if (c === null || !Number.isSafeInteger(c) || c < 0) { add(f, `${f.label}金额格式不正确`); break }
        if (opts.full === false) break
        if (rules.minCents !== null && rules.minCents !== undefined && c < rules.minCents)
          add(f, `${f.label}不能低于 ¥${formatCents(rules.minCents)}`)
        else if (rules.maxCents !== null && rules.maxCents !== undefined && c > rules.maxCents)
          add(f, `${f.label}不能超过 ¥${formatCents(rules.maxCents)}`)
        break
      }
      case 'DATE': {
        if (!isDateString(v)) { add(f, `${f.label}日期格式不正确`); break }
        if (opts.full === false) break
        const s = v
        const earliest = resolveDateExpr(rules.earliest)
        const latest = resolveDateExpr(rules.latest)
        if (earliest && compareDate(s, earliest) < 0) add(f, `${f.label}不能早于 ${earliest}`)
        else if (latest && compareDate(s, latest) > 0) add(f, `${f.label}不能晚于 ${latest}`)
        else if (rules.notBefore) {
          const other = values[rules.notBefore]
          const otherField = schema.fields.find((x) => x.key === rules.notBefore)
          if (typeof other === 'string' && other && compareDate(s, other) < 0) {
            add(f, `${f.label}不能早于${otherField?.label ?? rules.notBefore}`)
          }
        }
        break
      }
      case 'RADIO':
        if (!f.options?.some((o) => o.value === v)) add(f, `请重新选择${f.label}`)
        break
      case 'ATTACHMENT':
        if (!Array.isArray(v) || v.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)) add(f, `${f.label}附件格式不正确`)
        else if (v.length > (rules.maxCount ?? 10)) add(f, `${f.label}最多 ${rules.maxCount ?? 10} 个`)
        break
    }
  }
  return errors
}

/** DATE 字段选择器的可选范围 */
export function dateRange(f: FormField): { start: string; end: string } {
  return {
    start: resolveDateExpr(f.rules?.earliest) ?? '2000-01-01',
    end: resolveDateExpr(f.rules?.latest) ?? '2099-12-31',
  }
}
