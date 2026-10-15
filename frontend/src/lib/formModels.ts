// 表单内部模型（明细行带本地 key，附件保存元数据以便显示）与请求体 / 详情视图之间的转换
import type {
  AttachmentMeta,
  DupInvoiceWarning,
  ExpenseItemInput,
  ExpenseItemView,
  PurchaseItemInput,
  PurchaseItemView,
  PurchaseQuoteInput,
  PurchaseQuoteView,
} from './types'

let seq = 0
/** 本地行 key，只用于 v-for，不提交 */
export const rowKey = () => ++seq

const blank = (s: string | null | undefined) => s == null || s.trim() === ''
export const trimOrNull = (s: string | null | undefined): string | null => (blank(s) ? null : s!.trim())

// ---------- 采购 ----------

export interface PurchaseItemDraft extends PurchaseItemInput {
  key: number
  /** 只读模式下服务端计算的金额 */
  amountCents?: number | null
}

export interface QuoteDraft {
  key: number
  supplierName: string | null
  channel: 'ONLINE' | 'OFFLINE'
  quoteAmountCents: number | null
  url: string | null
  description: string | null
  attachments: AttachmentMeta[]
  /** 只读模式下服务端给出的最低价标记 */
  lowest?: boolean
}

export const emptyPurchaseItem = (): PurchaseItemDraft => ({
  key: rowKey(),
  name: null,
  spec: null,
  unit: null,
  quantity: null,
  unitPriceCents: null,
  remark: null,
})

export const emptyQuote = (): QuoteDraft => ({
  key: rowKey(),
  supplierName: null,
  channel: 'OFFLINE',
  quoteAmountCents: null,
  url: null,
  description: null,
  attachments: [],
})

export const isEmptyPurchaseItem = (i: PurchaseItemDraft) =>
  blank(i.name) && blank(i.spec) && blank(i.unit) && blank(i.quantity) && i.unitPriceCents == null && blank(i.remark)

export const isEmptyQuote = (q: QuoteDraft) =>
  blank(q.supplierName) && q.quoteAmountCents == null && blank(q.url) && blank(q.description) && q.attachments.length === 0

export const purchaseItemToInput = (i: PurchaseItemDraft): PurchaseItemInput => ({
  name: trimOrNull(i.name),
  spec: trimOrNull(i.spec),
  unit: trimOrNull(i.unit),
  quantity: trimOrNull(i.quantity),
  unitPriceCents: i.unitPriceCents,
  remark: trimOrNull(i.remark),
})

export const quoteToInput = (q: QuoteDraft): PurchaseQuoteInput => ({
  supplierName: trimOrNull(q.supplierName),
  channel: q.channel,
  quoteAmountCents: q.quoteAmountCents,
  url: trimOrNull(q.url),
  description: trimOrNull(q.description),
  attachmentIds: q.attachments.map((a) => a.id),
})

export const purchaseItemFromView = (i: PurchaseItemView): PurchaseItemDraft => ({
  key: rowKey(),
  name: i.name,
  spec: i.spec,
  unit: i.unit,
  quantity: i.quantity,
  unitPriceCents: i.unitPriceCents,
  remark: i.remark,
  amountCents: i.amountCents,
})

export const quoteFromView = (q: PurchaseQuoteView): QuoteDraft => ({
  key: rowKey(),
  supplierName: q.supplierName,
  channel: q.channel,
  quoteAmountCents: q.quoteAmountCents,
  url: q.url,
  description: q.description,
  attachments: q.attachments ?? [],
  lowest: q.lowest,
})

/** 报价中的最低金额（金额相同视为最低价） */
export function lowestQuoteCents(quotes: { quoteAmountCents: number | null }[]): number | null {
  const amounts = quotes.map((q) => q.quoteAmountCents).filter((c): c is number => c != null)
  return amounts.length ? Math.min(...amounts) : null
}

// ---------- 报销 ----------

export interface InvoiceDraft {
  attachment: AttachmentMeta
  invoiceNo: string | null
  /** 只读模式：跨单疑似重复（申请人本人查看时不含对方单号） */
  duplicates?: DupInvoiceWarning[]
  suspectedDuplicate?: boolean
}

export interface ExpenseItemDraft {
  key: number
  expenseTypeCode: string | null
  /** 只读模式下的类型名称 */
  expenseTypeName?: string | null
  occurDate: string | null
  purpose: string | null
  amountCents: number | null
  noInvoice: boolean
  noInvoiceReason: string | null
  invoices: InvoiceDraft[]
}

export const emptyExpenseItem = (): ExpenseItemDraft => ({
  key: rowKey(),
  expenseTypeCode: null,
  occurDate: null,
  purpose: null,
  amountCents: null,
  noInvoice: false,
  noInvoiceReason: null,
  invoices: [],
})

/** 全空的明细行（提交前剔除） */
export const isEmptyExpenseItem = (i: ExpenseItemDraft) =>
  !i.expenseTypeCode &&
  !i.occurDate &&
  blank(i.purpose) &&
  i.amountCents == null &&
  !i.noInvoice &&
  blank(i.noInvoiceReason) &&
  i.invoices.length === 0

export const expenseItemToInput = (i: ExpenseItemDraft): ExpenseItemInput => ({
  expenseTypeCode: i.expenseTypeCode,
  occurDate: i.occurDate,
  purpose: trimOrNull(i.purpose),
  amountCents: i.amountCents,
  noInvoice: i.noInvoice,
  noInvoiceReason: i.noInvoice ? trimOrNull(i.noInvoiceReason) : null,
  // 勾选无票时不带票据
  invoices: i.noInvoice ? [] : i.invoices.map((v) => ({ attachmentId: v.attachment.id, invoiceNo: trimOrNull(v.invoiceNo) })),
})

export const expenseItemFromView = (i: ExpenseItemView): ExpenseItemDraft => ({
  key: rowKey(),
  expenseTypeCode: i.expenseTypeCode,
  expenseTypeName: i.expenseTypeName,
  occurDate: i.occurDate,
  purpose: i.purpose,
  amountCents: i.amountCents,
  noInvoice: i.noInvoice,
  noInvoiceReason: i.noInvoiceReason,
  invoices: (i.invoices ?? []).map((v) => ({
    attachment: v.attachment,
    invoiceNo: v.invoiceNo,
    duplicates: v.duplicates ?? [],
    suspectedDuplicate: v.suspectedDuplicate || (v.duplicates?.length ?? 0) > 0,
  })),
})

// ---------- 空行剔除与错误路径映射 ----------

/** 剔除空行；map[提交下标] = 界面下标 */
export function compactRows<T>(rows: T[], isEmpty: (r: T) => boolean): { kept: T[]; map: number[] } {
  const kept: T[] = []
  const map: number[] = []
  rows.forEach((r, i) => {
    if (!isEmpty(r)) {
      kept.push(r)
      map.push(i)
    }
  })
  return { kept, map }
}

/** 服务端返回的 items[2].amountCents（提交下标）映射回界面行下标 */
export function remapIndexPath(path: string, prefix: string, map: number[]): string {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(\\d+)\\]`)
  return path.replace(re, (_m, idx: string) => `${prefix}[${map[Number(idx)] ?? Number(idx)}]`)
}

/** 输入过程中的十进制字符串（数量最多 3 位小数） */
export const QUANTITY_PARTIAL = /^\d{0,9}(\.\d{0,3})?$/
export const QUANTITY_RE = /^\d{1,9}(\.\d{1,3})?$/

/** 简单 URL 校验（线上报价链接） */
export function isHttpUrl(s: string | null | undefined): boolean {
  if (!s) return false
  try {
    const u = new URL(s.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
