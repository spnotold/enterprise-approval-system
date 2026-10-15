// 自定义表单（FormSchema）的客户端校验，规则与服务端 FormSchemaValidator 对应。
// 草稿保存只做格式校验（light）；提交前做完整校验（full），含必填与范围。
import type { FieldRules, FormField, FormSchema } from './types'
import { isDateString, resolveDateToken, todayShanghai } from './datetime'
import { formatCents } from './money'

export const PATTERN_PRESETS: Record<'MOBILE' | 'EMAIL', { regex: RegExp; message: string }> = {
  MOBILE: { regex: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
  EMAIL: { regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '请输入正确的邮箱' },
}

export const DEFAULT_MAX_LENGTH: Record<'TEXT' | 'TEXTAREA', number> = { TEXT: 200, TEXTAREA: 2000 }

const DEC_SCALE = 6

/** 十进制字符串 -> 放大 10^6 的 BigInt；非法返回 null */
export function parseDecimal(s: string | null | undefined): bigint | null {
  if (s === null || s === undefined) return null
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(s).trim())
  if (!m) return null
  const frac = m[3] ?? ''
  if (frac.length > DEC_SCALE) return null
  const v = BigInt(m[2]) * 10n ** BigInt(DEC_SCALE) + BigInt(frac.padEnd(DEC_SCALE, '0') || '0')
  return m[1] ? -v : v
}

export function decimalPlaces(s: string): number {
  const i = s.indexOf('.')
  return i < 0 ? 0 : s.length - i - 1
}

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** 字段初始值 */
export function defaultValue(field: FormField): unknown {
  return field.type === 'ATTACHMENT' ? [] : null
}

function textLength(s: string): number {
  return [...s].length
}

export interface ValidateOptions {
  /** true：提交前完整校验；false：保存草稿只校验格式 */
  full: boolean
  /** 错误路径前缀，默认 formValues. */
  prefix?: string
  today?: string
}

/** 校验单个字段，返回错误信息或 null */
export function validateField(
  field: FormField,
  value: unknown,
  values: Record<string, unknown>,
  schema: FormSchema,
  opts: ValidateOptions,
): string | null {
  const r: FieldRules = field.rules ?? {}
  const empty = isEmptyValue(value)
  if (empty) {
    return opts.full && field.required ? `请填写${field.label}` : null
  }
  switch (field.type) {
    case 'TEXT':
    case 'TEXTAREA': {
      if (typeof value !== 'string') return `${field.label}格式不正确`
      const len = textLength(value)
      const max = Math.min(r.maxLength ?? DEFAULT_MAX_LENGTH[field.type], DEFAULT_MAX_LENGTH[field.type])
      if (len > max) return `${field.label}不能超过 ${max} 字`
      if (!opts.full) return null
      if (r.minLength && len < r.minLength) return `${field.label}至少 ${r.minLength} 字`
      if (field.type === 'TEXT') {
        if (r.patternPreset && PATTERN_PRESETS[r.patternPreset]) {
          const p = PATTERN_PRESETS[r.patternPreset]
          if (!p.regex.test(value.trim())) return r.patternMessage || p.message
        } else if (r.pattern) {
          try {
            if (!new RegExp(r.pattern).test(value)) return r.patternMessage || `${field.label}格式不正确`
          } catch {
            // 模板中的正则无法编译时交给服务端判断
          }
        }
      }
      return null
    }
    case 'NUMBER': {
      const s = String(value).trim()
      const v = parseDecimal(s)
      if (v === null) return `${field.label}必须是数字`
      const precision = r.precision ?? 0
      if (decimalPlaces(s) > precision) {
        return precision === 0 ? `${field.label}必须是整数` : `${field.label}最多 ${precision} 位小数`
      }
      if (!opts.full) return null
      const min = parseDecimal(r.min)
      const max = parseDecimal(r.max)
      if (min !== null && v < min) return `${field.label}不能小于 ${r.min}`
      if (max !== null && v > max) return `${field.label}不能大于 ${r.max}`
      const step = parseDecimal(r.step)
      if (step !== null && step > 0n) {
        const base = min ?? 0n
        if ((v - base) % step !== 0n) return `${field.label}须按 ${r.step} 递增`
      }
      return null
    }
    case 'AMOUNT': {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return `${field.label}金额格式不正确`
      if (!opts.full) return null
      if (r.minCents != null && value < r.minCents) return `${field.label}不能低于 ¥${formatCents(r.minCents)}`
      if (r.maxCents != null && value > r.maxCents) return `${field.label}不能超过 ¥${formatCents(r.maxCents)}`
      return null
    }
    case 'DATE': {
      if (!isDateString(value)) return `${field.label}日期格式不正确`
      if (!opts.full) return null
      const today = opts.today ?? todayShanghai()
      const earliest = resolveDateToken(r.earliest, today)
      const latest = resolveDateToken(r.latest, today)
      if (earliest && value < earliest) return `${field.label}不能早于 ${earliest}`
      if (latest && value > latest) return `${field.label}不能晚于 ${latest}`
      if (r.notBefore) {
        const other = values[r.notBefore]
        if (isDateString(other) && value < other) {
          const otherLabel = schema.fields.find((f) => f.key === r.notBefore)?.label ?? r.notBefore
          return `${field.label}不能早于${otherLabel}`
        }
      }
      return null
    }
    case 'RADIO': {
      const ok = (field.options ?? []).some((o) => o.value === value)
      return ok ? null : `${field.label}的选项无效`
    }
    case 'ATTACHMENT': {
      if (!Array.isArray(value)) return `${field.label}格式不正确`
      const maxCount = r.maxCount ?? 10
      if (value.length > maxCount) return `${field.label}最多 ${maxCount} 个文件`
      return null
    }
    default:
      return null
  }
}

/** 校验整张表单，返回 路径 -> 错误信息 */
export function validateFormValues(
  schema: FormSchema,
  values: Record<string, unknown>,
  opts: ValidateOptions,
): Record<string, string> {
  const prefix = opts.prefix ?? 'formValues.'
  const errors: Record<string, string> = {}
  for (const f of schema.fields) {
    const msg = validateField(f, values[f.key], values, schema, opts)
    if (msg) errors[`${prefix}${f.key}`] = msg
  }
  return errors
}

/**
 * 模板更新（40906）后按新版本重新渲染：同 key 且同类型的字段保留原值，其余取默认值。
 * 返回新值与被丢弃的字段名，供界面提示。
 */
export function carryOverValues(
  oldSchema: FormSchema | null,
  newSchema: FormSchema,
  values: Record<string, unknown>,
): { values: Record<string, unknown>; dropped: string[] } {
  const oldTypes = new Map((oldSchema?.fields ?? []).map((f) => [f.key, f.type]))
  const next: Record<string, unknown> = {}
  for (const f of newSchema.fields) {
    const oldType = oldTypes.get(f.key)
    next[f.key] = oldType === f.type && f.key in values ? values[f.key] : defaultValue(f)
  }
  const newKeys = new Map(newSchema.fields.map((f) => [f.key, f.type]))
  const dropped = (oldSchema?.fields ?? [])
    .filter((f) => newKeys.get(f.key) !== f.type && !isEmptyValue(values[f.key]))
    .map((f) => f.label)
  return { values: next, dropped }
}
