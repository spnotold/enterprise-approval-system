// 移动端表单模型；只传业务字段，空行下标保留映射供服务端错误定位。
import type { AttachmentMeta, ExpenseSaveRequest, FieldError, PurchaseItemInput, PurchaseSaveRequest } from '@/lib/types'
import { MAX_ITEM_CENTS, multiplyCents } from '@/lib/money'
import { addDays, isDateString, todayCN } from './time'

let seq = 0
export const rowKey = (): number => ++seq
export const trimOrNull = (s: string | null | undefined): string | null => s?.trim() || null
const len = (s: string | null | undefined): number => [...(s?.trim() || '')].length

export function compactRows<T>(rows: T[], empty: (row: T) => boolean): { kept: T[]; map: number[] } {
  const kept: T[] = [], map: number[] = []
  rows.forEach((r, i) => { if (!empty(r)) { kept.push(r); map.push(i) } })
  return { kept, map }
}

export interface PurchaseItem extends PurchaseItemInput { key: number }
export interface Quote {
  key: number
  supplierName: string
  channel: 'ONLINE' | 'OFFLINE'
  quoteAmountCents: number | null
  url: string
  description: string
  attachments: AttachmentMeta[]
}
export interface PurchaseForm {
  title: string
  reason: string
  budgetLimitCents: number | null
  expectedArrivalDate: string
  singleSource: boolean
  singleSourceReason: string
  singleSourceAttachments: AttachmentMeta[]
  selectedQuoteIndex: number | null
  selectionReason: string
  notLowestReason: string
  items: PurchaseItem[]
  quotes: Quote[]
  attachments: AttachmentMeta[]
}
export const emptyPurchaseItem = (): PurchaseItem => ({ key: rowKey(), name: '', spec: '', unit: '', quantity: '', unitPriceCents: null, remark: '' })
export const emptyQuote = (): Quote => ({ key: rowKey(), supplierName: '', channel: 'OFFLINE', quoteAmountCents: null, url: '', description: '', attachments: [] })
export const emptyPurchase = (): PurchaseForm => ({ title: '', reason: '', budgetLimitCents: null, expectedArrivalDate: '', singleSource: false, singleSourceReason: '', singleSourceAttachments: [], selectedQuoteIndex: null, selectionReason: '', notLowestReason: '', items: [emptyPurchaseItem()], quotes: [emptyQuote(), emptyQuote()], attachments: [] })
export const emptyPurchaseRow = (r: PurchaseItem): boolean => ![r.name, r.spec, r.unit, r.quantity, r.remark].some(trimOrNull) && r.unitPriceCents === null
export const emptyQuoteRow = (q: Quote): boolean => ![q.supplierName, q.url, q.description].some(trimOrNull) && q.quoteAmountCents === null && !q.attachments.length
export function lowestQuote(quotes: Quote[]): number | null {
  const values = quotes.map(q => q.quoteAmountCents).filter((v): v is number => v !== null)
  return values.length ? Math.min(...values) : null
}

export function purchaseBody(m: PurchaseForm): { body: PurchaseSaveRequest; itemMap: number[]; quoteMap: number[] } {
  const items = compactRows(m.items, emptyPurchaseRow), quotes = compactRows(m.quotes, emptyQuoteRow)
  const selected = m.selectedQuoteIndex === null ? -1 : quotes.map.indexOf(m.selectedQuoteIndex)
  return { itemMap: items.map, quoteMap: quotes.map, body: {
    title: trimOrNull(m.title), reason: trimOrNull(m.reason), budgetLimitCents: m.budgetLimitCents,
    expectedArrivalDate: trimOrNull(m.expectedArrivalDate), singleSource: m.singleSource,
    singleSourceReason: m.singleSource ? trimOrNull(m.singleSourceReason) : null,
    singleSourceAttachmentIds: m.singleSource ? m.singleSourceAttachments.map(a => a.id) : [],
    selectedQuoteIndex: selected < 0 ? null : selected, selectionReason: trimOrNull(m.selectionReason), notLowestReason: trimOrNull(m.notLowestReason),
    items: items.kept.map(r => ({ name: trimOrNull(r.name), spec: trimOrNull(r.spec), unit: trimOrNull(r.unit), quantity: trimOrNull(r.quantity), unitPriceCents: r.unitPriceCents, remark: trimOrNull(r.remark) })),
    quotes: quotes.kept.map(q => ({ supplierName: trimOrNull(q.supplierName), channel: q.channel, quoteAmountCents: q.quoteAmountCents, url: trimOrNull(q.url), description: trimOrNull(q.description), attachmentIds: q.attachments.map(a => a.id) })),
    attachmentIds: m.attachments.map(a => a.id),
  } }
}

export function validatePurchase(m: PurchaseForm, full: boolean): FieldError[] {
  const errors: FieldError[] = []
  const add = (field: string, message: string) => errors.push({ field, message, rule: 'CLIENT' })
  const max = (field: string, value: string | null, limit: number) => { if (len(value) > limit) add(field, `不能超过 ${limit} 字`) }
  max('title', m.title, 100); max('reason', m.reason, 1000); max('singleSourceReason', m.singleSourceReason, 1000)
  max('selectionReason', m.selectionReason, 500); max('notLowestReason', m.notLowestReason, 500)
  const items = compactRows(m.items, emptyPurchaseRow), quotes = compactRows(m.quotes, emptyQuoteRow)
  if (items.kept.length > 50) add('items', '采购明细最多 50 条')
  const suppliers = new Map<string, number>()
  m.items.forEach((r, i) => {
    if (emptyPurchaseRow(r)) return
    const p = `items[${i}]`
    if (r.quantity && !/^\d{1,9}(\.\d{1,3})?$/.test(r.quantity.trim())) add(`${p}.quantity`, '数量最多 9 位整数、3 位小数')
    if (r.quantity && r.unitPriceCents !== null && multiplyCents(r.quantity, r.unitPriceCents) === null) add(`${p}.quantity`, '明细金额超出可计算范围，请调整数量或单价')
    if (!full) return
    if (!trimOrNull(r.name)) add(`${p}.name`, '请填写名称')
    if (!trimOrNull(r.unit)) add(`${p}.unit`, '请填写单位')
    if (!r.quantity || /^0+(\.0+)?$/.test(r.quantity.trim())) add(`${p}.quantity`, '数量必须大于 0')
    if (r.unitPriceCents === null || r.unitPriceCents <= 0) add(`${p}.unitPriceCents`, '单价必须大于 0')
  })
  m.quotes.forEach((q, i) => {
    if (emptyQuoteRow(q)) return
    const p = `quotes[${i}]`, name = q.supplierName.replace(/\s/g, '').toLowerCase()
    if (name && suppliers.has(name)) add(`${p}.supplierName`, `与第 ${(suppliers.get(name) ?? 0) + 1} 家供应商重复`)
    else if (name) suppliers.set(name, i)
    if (q.url && !/^https?:\/\/[^\s/?#]+(?:[^\s]*)$/i.test(q.url.trim())) add(`${p}.url`, '请填写有效的 http:// 或 https:// 链接')
    if (q.channel === 'ONLINE' && !q.url.trim()) add(`${p}.url`, '线上报价必须填写购买链接')
    if (!full) return
    if (!name) add(`${p}.supplierName`, '请填写供应商')
    if (q.quoteAmountCents === null || q.quoteAmountCents <= 0) add(`${p}.quoteAmountCents`, '报价金额必须大于 0')
    if (q.channel === 'ONLINE' && !q.attachments.some(a => a.contentType.startsWith('image/'))) add(`${p}.attachmentIds`, '线上报价至少上传 1 张截图')
    if (q.channel === 'OFFLINE' && !q.attachments.length && !q.description.trim()) add(`${p}.attachmentIds`, '请上传报价单或填写报价说明')
  })
  if (m.singleSource && !m.singleSourceReason.trim()) add('singleSourceReason', '单一来源必须填写说明')
  if (!full) return errors
  if (!m.title.trim()) add('title', '请填写标题')
  if (!m.reason.trim()) add('reason', '请填写采购事由')
  if (m.budgetLimitCents === null) add('budgetLimitCents', '请填写预算上限')
  if (!isDateString(m.expectedArrivalDate) || m.expectedArrivalDate < todayCN()) add('expectedArrivalDate', '请选择不早于今天的到货日期')
  if (!items.kept.length) add('items', '请至少填写 1 条采购明细')
  if (!m.singleSource && suppliers.size < 2) add('quotes', '至少需要 2 家不同供应商报价')
  if (m.singleSource && !quotes.kept.length) add('quotes', '请填写供应商报价')
  if (m.singleSource && len(m.singleSourceReason) < 20) add('singleSourceReason', '说明至少 20 字，请附说明材料或在说明中写明依据')
  const selected = m.selectedQuoteIndex === null ? null : m.quotes[m.selectedQuoteIndex]
  if (!selected || emptyQuoteRow(selected)) add('selectedQuoteIndex', '请选择拟选供应商')
  if (selected?.quoteAmountCents !== null && selected?.quoteAmountCents !== undefined) {
    const lowest = lowestQuote(m.quotes)
    if (lowest !== null && selected.quoteAmountCents > lowest && len(m.notLowestReason) < 10) add('notLowestReason', '未选最低价理由至少 10 字')
    if (m.budgetLimitCents !== null && selected.quoteAmountCents > m.budgetLimitCents) add('budgetLimitCents', '拟选报价超过预算上限')
  }
  return errors
}

export interface ExpenseRow {
  key: number
  expenseTypeCode: string
  occurDate: string
  purpose: string
  amountCents: number | null
  noInvoice: boolean
  noInvoiceReason: string
  attachments: AttachmentMeta[]
  invoiceNos: string[]
}
export interface ExpenseForm {
  title: string
  description: string
  linkMode: 'RELATED' | 'INDEPENDENT'
  relatedApplicationIds: number[]
  independentReason: string
  items: ExpenseRow[]
}
export const emptyExpenseRow = (): ExpenseRow => ({ key: rowKey(), expenseTypeCode: '', occurDate: '', purpose: '', amountCents: null, noInvoice: false, noInvoiceReason: '', attachments: [], invoiceNos: [] })
export const emptyExpense = (): ExpenseForm => ({ title: '', description: '', linkMode: 'RELATED', relatedApplicationIds: [], independentReason: '', items: Array.from({ length: 3 }, emptyExpenseRow) })
export const emptyExpenseItem = (r: ExpenseRow): boolean => ![r.expenseTypeCode, r.occurDate, r.purpose, r.noInvoiceReason].some(trimOrNull) && r.amountCents === null && !r.noInvoice && !r.attachments.length

export function expenseBody(m: ExpenseForm): { body: ExpenseSaveRequest; itemMap: number[] } {
  const rows = compactRows(m.items, emptyExpenseItem)
  return { itemMap: rows.map, body: {
    title: trimOrNull(m.title), description: trimOrNull(m.description), relatedApplicationIds: m.linkMode === 'RELATED' ? [...m.relatedApplicationIds] : [], independentReason: m.linkMode === 'INDEPENDENT' ? trimOrNull(m.independentReason) : null,
    items: rows.kept.map(r => ({ expenseTypeCode: trimOrNull(r.expenseTypeCode), occurDate: trimOrNull(r.occurDate), purpose: trimOrNull(r.purpose), amountCents: r.amountCents, noInvoice: r.noInvoice, noInvoiceReason: r.noInvoice ? trimOrNull(r.noInvoiceReason) : null, invoices: r.noInvoice ? [] : r.attachments.map((a, i) => ({ attachmentId: a.id, invoiceNo: trimOrNull(r.invoiceNos[i]) })) })),
  } }
}

export function validateExpense(m: ExpenseForm, full: boolean, enabledTypes: string[]): FieldError[] {
  const errors: FieldError[] = []
  const add = (field: string, message: string) => errors.push({ field, message, rule: 'CLIENT' })
  if (len(m.title) > 100) add('title', '标题不能超过 100 字')
  if (len(m.description) > 1000) add('description', '报销说明不能超过 1000 字')
  if (len(m.independentReason) > 500) add('independentReason', '独立报销说明不能超过 500 字')
  const rows = compactRows(m.items, emptyExpenseItem)
  if (rows.kept.length > 50) add('items', '费用明细最多 50 条')
  const files = new Map<string, number>(), nos = new Map<string, number>()
  const today = todayCN(), earliest = addDays(today, -365)
  m.items.forEach((r, i) => {
    if (emptyExpenseItem(r)) return
    const p = `items[${i}]`
    if (len(r.purpose) > 200) add(`${p}.purpose`, '用途说明不能超过 200 字')
    if (len(r.noInvoiceReason) > 300) add(`${p}.noInvoiceReason`, '无票原因不能超过 300 字')
    if (r.amountCents !== null && r.amountCents > MAX_ITEM_CENTS) add(`${p}.amountCents`, '单条金额不能超过 ¥100,000.00')
    if (r.noInvoice && !r.noInvoiceReason.trim()) add(`${p}.noInvoiceReason`, '无票必须填写原因')
    if (r.noInvoice && r.attachments.length) add(`${p}.invoices`, '无票明细不能同时上传票据')
    if (r.attachments.length > 10) add(`${p}.invoices`, '每条明细最多 10 张票据')
    r.attachments.forEach((a, j) => {
      const file = a.sha256 || String(a.id), no = r.invoiceNos[j]?.replace(/\s/g, '').toUpperCase() || ''
      const duplicate = files.get(file) ?? (no ? nos.get(no) : undefined)
      if (duplicate !== undefined) add(`${p}.invoices[${j}]`, `票据与第 ${duplicate + 1} 条明细重复，同单不可重复使用`)
      files.set(file, i)
      if (no) nos.set(no, i)
    })
    if (!full) return
    if (!r.expenseTypeCode || !enabledTypes.includes(r.expenseTypeCode)) add(`${p}.expenseTypeCode`, '请选择启用的费用类型')
    if (!isDateString(r.occurDate) || r.occurDate < earliest || r.occurDate > today) add(`${p}.occurDate`, '发生日期须在今天及之前 365 天内')
    if (!r.purpose.trim()) add(`${p}.purpose`, '请填写用途说明')
    if (r.amountCents === null || r.amountCents <= 0) add(`${p}.amountCents`, '金额必须大于 0')
    if (r.noInvoice && len(r.noInvoiceReason) < 10) add(`${p}.noInvoiceReason`, '无票原因至少 10 字')
    if (!r.noInvoice && !r.attachments.length) add(`${p}.invoices`, '请上传票据或勾选无票并填写原因')
  })
  if (!full) return errors
  if (!m.title.trim()) add('title', '请填写标题')
  if (!rows.kept.length) add('items', '请至少填写 1 条费用明细')
  if (m.linkMode === 'RELATED' && !m.relatedApplicationIds.length) add('relatedApplicationIds', '请选择已通过的申请，或选择独立报销')
  if (m.linkMode === 'INDEPENDENT' && !m.independentReason.trim()) add('independentReason', '请填写独立报销说明')
  return errors
}
