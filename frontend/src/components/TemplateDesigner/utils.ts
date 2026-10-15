// 流程设计器的公共逻辑：默认值、标识生成、摘要文本、本地校验与校验路径定位
import { toRaw, type InjectionKey } from 'vue'
import type {
  AppType,
  ApproverRule,
  Condition,
  ConditionOp,
  ConditionRule,
  FieldOption,
  FieldType,
  FormField,
  FormSchema,
  NodeDef,
  NodeMode,
  RoleCode,
  ValidationIssue,
} from '@/lib/types'
import { FIELD_TYPE_LABEL, ROLE_LABEL } from '@/lib/labels'
import { formatCents } from '@/lib/money'
import { isDateString, resolveDateToken } from '@/lib/datetime'
import { decimalPlaces, parseDecimal } from '@/lib/formSchema'
import { normalizePath } from '@/composables/useFieldErrors'

// ---------- 常量 ----------

export const FIELD_TYPES: FieldType[] = ['TEXT', 'TEXTAREA', 'NUMBER', 'AMOUNT', 'DATE', 'RADIO', 'ATTACHMENT']

export const FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/

/** 字段标识保留字（与系统变量、申请主表字段冲突），不区分大小写 */
export const RESERVED_KEYS = [
  'amountCents',
  'naturalDays',
  'title',
  'id',
  'appNo',
  'status',
  'version',
  'type',
  'applicant',
  'applicantId',
  'deptId',
  'templateId',
  'formValues',
  'createdAt',
  'updatedAt',
  'submittedAt',
]

export const TEXT_MAX: Record<'TEXT' | 'TEXTAREA', number> = { TEXT: 200, TEXTAREA: 2000 }

export const ATTACHMENT_TYPES: { value: string; label: string }[] = [
  { value: 'image/jpeg', label: 'JPEG 图片' },
  { value: 'image/png', label: 'PNG 图片' },
  { value: 'application/pdf', label: 'PDF 文件' },
]

/** 审批人规则可选的角色（系统管理员不审批，员工角色人人都有） */
export const APPROVER_ROLES: RoleCode[] = ['DEPT_HEAD', 'FINANCE_APPROVER', 'ENTERPRISE_HEAD']

export const MIN_NODES = 2
export const MAX_NODES = 10
export const MAX_OPTIONS = 20
export const MIN_OPTIONS = 2

export const OP_SYMBOL: Record<ConditionOp, string> = {
  EQ: '=',
  NE: '≠',
  GT: '>',
  GTE: '≥',
  LT: '<',
  LTE: '≤',
  IN: '属于',
}

export const ALL_OPS: ConditionOp[] = ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'IN']
export const RADIO_OPS: ConditionOp[] = ['EQ', 'NE', 'IN']

/** 发布校验码的中文说明（设计文档 Q8） */
export const TPL_CODE_LABEL: Record<string, string> = {
  TPL_BASIC: '基本信息',
  TPL_FIELD_KEY_DUP: '字段标识重复或为保留字',
  TPL_FIELD_INVALID: '字段规则不合法',
  TPL_FIELD_EMPTY: '缺少表单字段',
  TPL_NODE_COUNT: '节点数量',
  TPL_NODE_INCOMPLETE: '节点配置不完整',
  TPL_APPROVER_INVALID: '审批人无法解析',
  TPL_CONDITION_REF: '条件引用有误',
  TPL_ALL_SKIPPABLE: '所有节点都可能被跳过',
  TPL_CYCLE: '节点顺序有误',
}

// ---------- 工具 ----------

/** 深拷贝（对 Vue 响应式代理也安全） */
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

const uids = new WeakMap<object, number>()
let uidSeq = 0
/** 对象的稳定标识，用作 v-for 的 key（字段 key / nodeKey 可能被编辑或重复） */
export function uidOf(o: object): number {
  const raw = toRaw(o)
  let id = uids.get(raw)
  if (id === undefined) {
    id = ++uidSeq
    uids.set(raw, id)
  }
  return id
}

/** 已知用户 id -> 姓名，供指定用户规则的预置显示与摘要文本使用 */
export const USER_NAMES_KEY: InjectionKey<Record<number, string>> = Symbol('templateDesignerUserNames')

export function userName(names: Record<number, string> | undefined, id: number | null | undefined): string {
  if (id == null) return '未选择'
  return names?.[id] ?? `用户 #${id}`
}

// ---------- 默认值 ----------

export function nextFieldKey(fields: FormField[]): string {
  const used = new Set(fields.map((f) => (f.key ?? '').toLowerCase()))
  let i = 1
  while (used.has(`field${i}`)) i++
  return `field${i}`
}

export function nextNodeKey(nodes: NodeDef[]): string {
  const used = new Set(nodes.map((n) => (n.nodeKey ?? '').toUpperCase()))
  let i = 1
  while (used.has(`N${i}`)) i++
  return `N${i}`
}

function uniqueLabel(base: string, fields: FormField[]): string {
  const used = new Set(fields.map((f) => f.label))
  if (!used.has(base)) return base
  let i = 2
  while (used.has(`${base}${i}`)) i++
  return `${base}${i}`
}

export function newField(type: FieldType, fields: FormField[]): FormField {
  const f: FormField = { key: nextFieldKey(fields), label: uniqueLabel(FIELD_TYPE_LABEL[type], fields), type, required: false }
  if (type === 'RADIO') {
    f.options = [
      { value: 'OPT1', label: '选项1' },
      { value: 'OPT2', label: '选项2' },
    ]
  }
  if (type === 'NUMBER') f.rules = { precision: 0 }
  if (type === 'ATTACHMENT') f.rules = { maxCount: 5, maxSizeMb: 10 }
  return f
}

export function newNode(nodes: NodeDef[]): NodeDef {
  return {
    nodeKey: nextNodeKey(nodes),
    name: `审批节点${nodes.length + 1}`,
    approverRule: { type: 'APPLICANT_DEPT_HEAD' },
    mode: 'SINGLE',
  }
}

export function nextOptionValue(options: FieldOption[]): string {
  const used = new Set(options.map((o) => o.value))
  let i = options.length + 1
  while (used.has(`OPT${i}`)) i++
  return `OPT${i}`
}

// ---------- 条件变量 ----------

export type VarKind = 'NUMBER' | 'AMOUNT' | 'DATE' | 'RADIO'

export interface CondVar {
  key: string
  label: string
  kind: VarKind
  system: boolean
  options?: FieldOption[]
}

/** 条件可引用的变量：数字 / 金额 / 日期 / 单选字段；内置模板另有系统变量 */
export function conditionVars(schema: FormSchema | null | undefined, builtin: AppType | null | undefined): CondVar[] {
  const list: CondVar[] = []
  if (builtin === 'EXPENSE' || builtin === 'PURCHASE') {
    list.push({ key: 'amountCents', label: '申请金额', kind: 'AMOUNT', system: true })
  } else if (builtin === 'TRAVEL') {
    list.push({ key: 'amountCents', label: '差旅预算', kind: 'AMOUNT', system: true })
    list.push({ key: 'naturalDays', label: '出差天数（自然日）', kind: 'NUMBER', system: true })
  }
  for (const f of schema?.fields ?? []) {
    if (!f.key) continue
    if (f.type === 'NUMBER' || f.type === 'AMOUNT' || f.type === 'DATE' || f.type === 'RADIO') {
      list.push({ key: f.key, label: f.label || f.key, kind: f.type, system: false, options: f.options })
    }
  }
  return list
}

export function opsFor(kind: VarKind | undefined): ConditionOp[] {
  return kind === 'RADIO' ? RADIO_OPS : ALL_OPS
}

function fmtCondValue(v: string | null | undefined, cv: CondVar | undefined): string {
  if (v === null || v === undefined || v === '') return '？'
  if (cv?.kind === 'AMOUNT') return /^\d+$/.test(v) ? `¥${formatCents(Number(v))}` : v
  if (cv?.kind === 'RADIO') return cv.options?.find((o) => o.value === v)?.label ?? v
  return v
}

export function conditionRuleText(r: ConditionRule, vars: CondVar[]): string {
  const cv = vars.find((v) => v.key === r.var)
  const name = cv?.label ?? (r.var ? `${r.var}（不存在）` : '？')
  if (r.op === 'IN') {
    const vals = (r.values ?? []).map((v) => fmtCondValue(v, cv))
    return `${name} 属于 {${vals.length ? vals.join('、') : '？'}}`
  }
  return `${name} ${OP_SYMBOL[r.op] ?? r.op} ${fmtCondValue(r.value, cv)}`
}

/** 如 “申请金额 ≥ ¥10,000.00 且 天数 > 3” */
export function conditionText(c: Condition | null | undefined, vars: CondVar[]): string {
  if (!c || !c.rules?.length) return ''
  const joiner = c.logic === 'OR' ? ' 或 ' : ' 且 '
  return c.rules.map((r) => conditionRuleText(r, vars)).join(joiner)
}

// ---------- 审批人规则 ----------

export function isMultiMode(mode: NodeMode | undefined): boolean {
  return mode === 'COUNTERSIGN' || mode === 'OR_SIGN'
}

export function approverRuleText(
  rule: ApproverRule | null | undefined,
  mode: NodeMode | undefined,
  names?: Record<number, string>,
): string {
  if (!rule) return '未设置'
  switch (rule.type) {
    case 'SPECIFIED_USER': {
      if (isMultiMode(mode)) {
        const ids = rule.userIds ?? (rule.userId != null ? [rule.userId] : [])
        return `指定用户：${ids.length ? ids.map((id) => userName(names, id)).join('、') : '未选择'}`
      }
      return `指定用户：${userName(names, rule.userId ?? rule.userIds?.[0] ?? null)}`
    }
    case 'APPLICANT_DEPT_HEAD':
      return '申请人部门负责人'
    case 'ROLE':
      return rule.roleCode
        ? `${ROLE_LABEL[rule.roleCode] ?? rule.roleCode}${isMultiMode(mode) ? '（全部持有人）' : '（主办人）'}`
        : '角色：未选择'
    default:
      return '未设置'
  }
}

export function approverRuleProblem(rule: ApproverRule | null | undefined, mode: NodeMode | undefined): string | null {
  if (!rule || !rule.type) return '请选择审批人规则'
  if (rule.type === 'SPECIFIED_USER') {
    if (isMultiMode(mode)) return rule.userIds?.length ? null : '请至少选择一名审批人'
    return rule.userId != null ? null : '请选择审批人'
  }
  if (rule.type === 'ROLE') return rule.roleCode ? null : '请选择角色'
  return null
}

// ---------- 错误映射 ----------

/** 相对路径 -> 错误信息列表；'' 表示针对整体 */
export type ErrMap = Record<string, string[]>

function addErr(map: ErrMap, path: string, msg: string) {
  const list = (map[path] ??= [])
  if (!list.includes(msg)) list.push(msg)
}

export function mergeErr(...maps: ErrMap[]): ErrMap {
  const out: ErrMap = {}
  for (const m of maps) for (const [k, list] of Object.entries(m)) for (const msg of list) addErr(out, k, msg)
  return out
}

/** sub 及其下级路径的错误，用 “；” 连接 */
export function errAt(map: ErrMap | undefined, sub: string): string {
  if (!map) return ''
  const out: string[] = []
  for (const [k, list] of Object.entries(map)) {
    if (k === sub || (sub !== '' && (k.startsWith(`${sub}.`) || k.startsWith(`${sub}[`)))) {
      for (const m of list) if (!out.includes(m)) out.push(m)
    }
  }
  return out.join('；')
}

/** 只取 sub 下的子映射（键去掉前缀），如 condition -> rules[0].value */
export function subErr(map: ErrMap | undefined, sub: string): ErrMap {
  const out: ErrMap = {}
  if (!map) return out
  for (const [k, list] of Object.entries(map)) {
    let rel: string | null = null
    if (k === sub) rel = ''
    else if (k.startsWith(`${sub}.`)) rel = k.slice(sub.length + 1)
    else if (k.startsWith(`${sub}[`)) rel = k.slice(sub.length)
    if (rel !== null) for (const m of list) addErr(out, rel, m)
  }
  return out
}

export function errCount(map: ErrMap | undefined): number {
  if (!map) return 0
  return Object.values(map).reduce((s, l) => s + l.length, 0)
}

/** 服务端路径规范化：去掉 formSchema. / nodeConfig. 前缀，items.2.x -> items[2].x */
export function normalizeIssuePath(p: string | null | undefined): string | null {
  if (!p) return null
  const s = normalizePath(p.trim()).replace(/^(?:draft\.)?(?:formSchema|nodeConfig)\./, '')
  return s || null
}

export type PathTarget =
  | { kind: 'field'; index: number; sub: string }
  | { kind: 'node'; index: number; sub: string }
  | { kind: 'fields' }
  | { kind: 'nodes' }
  | { kind: 'general' }

export function parseTarget(path: string | null | undefined): PathTarget {
  const p = normalizeIssuePath(path)
  if (!p) return { kind: 'general' }
  let m = /^fields\[(\d+)\]\.?(.*)$/.exec(p)
  if (m) return { kind: 'field', index: Number(m[1]), sub: m[2] }
  m = /^nodes\[(\d+)\]\.?(.*)$/.exec(p)
  if (m) return { kind: 'node', index: Number(m[1]), sub: m[2] }
  if (/^(fields|formSchema)(\.|$)/.test(p)) return { kind: 'fields' }
  if (/^(nodes|nodeConfig)(\.|$)/.test(p)) return { kind: 'nodes' }
  return { kind: 'general' }
}

/** 某个字段 / 节点下的服务端问题，键为相对路径 */
export function issuesUnder(issues: ValidationIssue[], kind: 'field' | 'node', index: number): ErrMap {
  const out: ErrMap = {}
  for (const i of issues) {
    const t = parseTarget(i.path)
    if (t.kind === kind && t.index === index) addErr(out, t.sub, i.message)
  }
  return out
}

// ---------- 本地校验（即时提示，最终以服务端发布校验为准） ----------

export function fieldKeyProblem(key: string, index: number, fields: FormField[]): string | null {
  const k = (key ?? '').trim()
  if (!k) return '请填写字段标识'
  if (!FIELD_KEY_RE.test(k)) return '以字母开头，只含字母、数字、下划线，最长 32 位'
  const lower = k.toLowerCase()
  if (RESERVED_KEYS.some((r) => r.toLowerCase() === lower)) return `“${k}”是保留字，请换一个标识`
  const dup = fields.findIndex((f, i) => i !== index && (f.key ?? '').trim().toLowerCase() === lower)
  if (dup >= 0) return `与第 ${dup + 1} 个字段“${fields[dup].label || fields[dup].key}”的标识重复（不区分大小写）`
  return null
}

export function regexProblem(pattern: string | null | undefined): string | null {
  if (!pattern) return null
  try {
    new RegExp(pattern)
    return null
  } catch (e) {
    return `正则表达式无法编译：${e instanceof Error ? e.message : String(e)}`
  }
}

export function decimalProblem(v: string | null | undefined, precision: number | undefined): string | null {
  if (v === null || v === undefined || v === '') return null
  if (parseDecimal(v) === null) return '请输入十进制数字，如 0.5'
  if (decimalPlaces(v.trim()) > (precision ?? 0)) return `小数位数超过精度设置（${precision ?? 0} 位）`
  return null
}

export function dateTokenProblem(v: string | null | undefined): string | null {
  if (!v) return null
  return resolveDateToken(v) ? null : '格式应为 YYYY-MM-DD、TODAY、TODAY+N 或 TODAY-N'
}

/** 字段的本地问题，键为相对路径（key、label、rules.min、options 等） */
export function fieldProblems(field: FormField, index: number, fields: FormField[]): ErrMap {
  const out: ErrMap = {}
  const keyErr = fieldKeyProblem(field.key, index, fields)
  if (keyErr) addErr(out, 'key', keyErr)
  if (!(field.label ?? '').trim()) addErr(out, 'label', '请填写字段名称')
  const r = field.rules ?? {}
  switch (field.type) {
    case 'TEXT':
    case 'TEXTAREA': {
      if (r.minLength != null && r.maxLength != null && r.minLength > r.maxLength) {
        addErr(out, 'rules.minLength', '最小长度不能大于最大长度')
      }
      if (field.type === 'TEXT' && !r.patternPreset) {
        const re = regexProblem(r.pattern)
        if (re) addErr(out, 'rules.pattern', re)
      }
      break
    }
    case 'NUMBER': {
      for (const k of ['min', 'max', 'step'] as const) {
        const p = decimalProblem(r[k], r.precision)
        if (p) addErr(out, `rules.${k}`, p)
      }
      const min = parseDecimal(r.min)
      const max = parseDecimal(r.max)
      if (min !== null && max !== null && min > max) addErr(out, 'rules.min', '最小值不能大于最大值')
      const step = parseDecimal(r.step)
      if (step !== null && step <= 0n) addErr(out, 'rules.step', '步长必须大于 0')
      break
    }
    case 'AMOUNT':
      if (r.minCents != null && r.maxCents != null && r.minCents > r.maxCents) {
        addErr(out, 'rules.minCents', '最小金额不能大于最大金额')
      }
      break
    case 'DATE': {
      const e1 = dateTokenProblem(r.earliest)
      const e2 = dateTokenProblem(r.latest)
      if (e1) addErr(out, 'rules.earliest', e1)
      if (e2) addErr(out, 'rules.latest', e2)
      const a = resolveDateToken(r.earliest)
      const b = resolveDateToken(r.latest)
      if (a && b && a > b) addErr(out, 'rules.earliest', '最早日期不能晚于最晚日期')
      if (r.notBefore) {
        const other = fields.find((f) => f.key === r.notBefore)
        if (!other || other.type !== 'DATE') addErr(out, 'rules.notBefore', '引用的日期字段不存在')
        else if (other === field) addErr(out, 'rules.notBefore', '不能引用自身')
      }
      break
    }
    case 'RADIO': {
      const opts = field.options ?? []
      if (opts.length < MIN_OPTIONS || opts.length > MAX_OPTIONS) {
        addErr(out, 'options', `选项数量应为 ${MIN_OPTIONS}–${MAX_OPTIONS} 项`)
      }
      const seen = new Set<string>()
      opts.forEach((o, i) => {
        const v = (o.value ?? '').trim()
        if (!v || !(o.label ?? '').trim()) addErr(out, `options[${i}]`, `第 ${i + 1} 项的显示名和值都不能为空`)
        else if (seen.has(v)) addErr(out, `options[${i}]`, `第 ${i + 1} 项的值“${v}”重复`)
        seen.add(v)
      })
      break
    }
    default:
      break
  }
  if (field.type !== 'AMOUNT' && field.statAmount) addErr(out, 'statAmount', '只有金额字段可以作为统计金额')
  return out
}

function condValueProblem(v: string | null | undefined, cv: CondVar): string | null {
  if (v === null || v === undefined || v === '') return '请填写比较值'
  switch (cv.kind) {
    case 'AMOUNT':
      return /^\d+$/.test(v) ? null : '金额格式不正确'
    case 'NUMBER':
      return parseDecimal(v) === null ? '请输入数字' : null
    case 'DATE':
      return isDateString(v) ? null : '请选择日期'
    case 'RADIO':
      return cv.options?.some((o) => o.value === v) ? null : '选项不存在'
    default:
      return null
  }
}

export function conditionProblems(c: Condition | null | undefined, vars: CondVar[]): ErrMap {
  const out: ErrMap = {}
  if (!c) return out
  if (!c.rules?.length) {
    addErr(out, '', '请至少添加一条条件，或关闭生效条件')
    return out
  }
  c.rules.forEach((r, i) => {
    const p = `rules[${i}]`
    if (!r.var) return addErr(out, p, `第 ${i + 1} 条：请选择变量`)
    const cv = vars.find((v) => v.key === r.var)
    if (!cv) return addErr(out, p, `第 ${i + 1} 条：引用的字段“${r.var}”不存在或类型不支持`)
    if (!opsFor(cv.kind).includes(r.op)) return addErr(out, p, `第 ${i + 1} 条：运算符不适用于该变量`)
    if (r.op === 'IN') {
      const vals = r.values ?? []
      if (!vals.length) return addErr(out, p, `第 ${i + 1} 条：请至少填写一个值`)
      for (const v of vals) {
        const e = condValueProblem(v, cv)
        if (e) return addErr(out, p, `第 ${i + 1} 条：${e}`)
      }
      return
    }
    const e = condValueProblem(r.value, cv)
    if (e) addErr(out, p, `第 ${i + 1} 条：${e}`)
  })
  return out
}

export function nodeProblems(node: NodeDef, vars: CondVar[]): ErrMap {
  const out: ErrMap = {}
  if (!(node.name ?? '').trim()) addErr(out, 'name', '请填写节点名称')
  const a = approverRuleProblem(node.approverRule, node.mode)
  if (a) addErr(out, 'approverRule', a)
  if (node.fallbackRule) {
    const f = approverRuleProblem(node.fallbackRule, node.mode)
    if (f) addErr(out, 'fallbackRule', f)
  }
  if (node.timeoutHours != null && (!Number.isInteger(node.timeoutHours) || node.timeoutHours <= 0)) {
    addErr(out, 'timeoutHours', '超时时限应为正整数小时')
  }
  const cond = conditionProblems(node.condition, vars)
  for (const [k, list] of Object.entries(cond)) for (const m of list) addErr(out, k ? `condition.${k}` : 'condition', m)
  return out
}
