import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './loadTs.mjs'

const f = loadTs('utils/applyForms.ts')
const custom = loadTs('utils/customForm.ts')
const time = loadTs('utils/time.ts')
const file = (id, sha256 = `sha-${id}`) => ({ id, sha256, originalName: `${id}.png`, contentType: 'image/png', sizeBytes: 100 })
const fields = errors => errors.map(e => e.field)

function purchase() {
  const m = f.emptyPurchase()
  Object.assign(m, { title: '研发采购', reason: '办公采购', budgetLimitCents: 20000, expectedArrivalDate: time.todayCN(), selectedQuoteIndex: 0 })
  Object.assign(m.items[0], { name: '键盘', unit: '个', quantity: '1.125', unitPriceCents: 10000 })
  Object.assign(m.quotes[0], { supplierName: '供应商A', quoteAmountCents: 12000, description: '含税包邮' })
  Object.assign(m.quotes[1], { supplierName: '供应商B', quoteAmountCents: 12000, description: '含税包邮' })
  return m
}
function expense() {
  const m = f.emptyExpense()
  Object.assign(m, { title: '办公报销', linkMode: 'INDEPENDENT', independentReason: '日常零星费用' })
  Object.assign(m.items[1], { expenseTypeCode: 'OFFICE', occurDate: time.todayCN(), purpose: '购置文具', amountCents: 10000, attachments: [file(1)], invoiceNos: ['a 123'] })
  return m
}

test('采购空行剔除后保留报价选择下标映射，业务请求不带 UI key', () => {
  const m = purchase()
  m.items.unshift(f.emptyPurchaseItem()); m.quotes.unshift(f.emptyQuote()); m.selectedQuoteIndex = 2
  const r = f.purchaseBody(m)
  assert.equal(r.itemMap.join(','), '1'); assert.equal(r.quoteMap.join(','), '1,2')
  assert.equal(r.body.selectedQuoteIndex, 1); assert.equal('key' in r.body.items[0], false)
})
test('同价视为最低价；高价选择需理由且不能超预算', () => {
  const m = purchase()
  assert.equal(f.validatePurchase(m, true).length, 0)
  m.quotes[0].quoteAmountCents = 21000
  assert.ok(fields(f.validatePurchase(m, true)).includes('notLowestReason'))
  assert.ok(fields(f.validatePurchase(m, true)).includes('budgetLimitCents'))
})
test('草稿允许不完整内容，仍拒绝重复供应商和线上缺链接', () => {
  assert.equal(f.validatePurchase(f.emptyPurchase(), false).length, 0)
  const m = purchase()
  m.quotes[0].supplierName = ' Ac me '; m.quotes[1].supplierName = 'acME'; m.quotes[1].channel = 'ONLINE'
  const errors = fields(f.validatePurchase(m, false))
  assert.ok(errors.includes('quotes[1].supplierName')); assert.ok(errors.includes('quotes[1].url'))
})
test('采购验证截图、数量格式、到货日期与单一来源说明', () => {
  const m = purchase()
  Object.assign(m.quotes[0], { channel: 'ONLINE', url: 'https://example.com/item', attachments: [file(1)] })
  assert.equal(f.validatePurchase(m, true).length, 0)
  m.quotes[0].attachments = [{ ...file(1), contentType: 'application/pdf' }]
  m.items[0].quantity = '1.0001'; m.expectedArrivalDate = time.addDays(time.todayCN(), -1)
  m.singleSource = true; m.singleSourceReason = '不足二十字'
  const errors = fields(f.validatePurchase(m, true))
  for (const key of ['quotes[0].attachmentIds', 'items[0].quantity', 'expectedArrivalDate', 'singleSourceReason']) assert.ok(errors.includes(key), key)
})
test('报销默认三条空行，保存时剔除并保留原界面下标', () => {
  const m = expense(), r = f.expenseBody(m)
  assert.equal(r.itemMap.join(','), '1'); assert.equal(r.body.items.length, 1)
  assert.equal(r.body.items[0].invoices[0].invoiceNo, 'a 123')
  assert.equal(f.validateExpense(m, true, ['OFFICE']).length, 0)
})
test('同单文件哈希或标准化票据号重复均拒绝，包括一行内重复', () => {
  const m = expense()
  m.items[1].attachments.push(file(2, 'sha-1')); m.items[1].invoiceNos.push('different')
  assert.ok(fields(f.validateExpense(m, false, ['OFFICE'])).includes('items[1].invoices[1]'))
  m.items[1].attachments[1] = file(2); m.items[1].invoiceNos[1] = 'A123'
  assert.ok(fields(f.validateExpense(m, false, ['OFFICE'])).includes('items[1].invoices[1]'))
})
test('报销日期、单条十万元边界及停用类型', () => {
  const m = expense(), r = m.items[1]
  r.occurDate = time.addDays(time.todayCN(), -365); r.amountCents = 10000000
  assert.equal(f.validateExpense(m, true, ['OFFICE']).length, 0)
  r.occurDate = time.addDays(r.occurDate, -1); r.amountCents++
  const errors = fields(f.validateExpense(m, true, []))
  for (const key of ['items[1].occurDate', 'items[1].amountCents', 'items[1].expenseTypeCode']) assert.ok(errors.includes(key), key)
})
test('无票原因成对约束、票据互斥；独立模式不发送隐藏的关联申请', () => {
  const m = expense(), r = m.items[1]
  r.noInvoice = true
  let errors = fields(f.validateExpense(m, false, ['OFFICE']))
  assert.ok(errors.includes('items[1].noInvoiceReason')); assert.ok(errors.includes('items[1].invoices'))
  r.attachments = []; r.invoiceNos = []; r.noInvoiceReason = '说明本次遗失票据的详细原因'
  m.relatedApplicationIds = [7]
  assert.equal(f.validateExpense(m, true, ['OFFICE']).length, 0)
  assert.equal(f.expenseBody(m).body.relatedApplicationIds.length, 0)
})
test('自定义草稿允许必填空值，提交按 schema 校验；已填字段仍校验格式', () => {
  const schema = { fields: [{ key: 'days', label: '天数', type: 'NUMBER', required: true, rules: { min: '0.5', max: '30', precision: 1 } }] }
  assert.equal(custom.validateCustom(schema, {}, { full: false }).length, 0)
  assert.equal(custom.validateCustom(schema, {}).length, 1)
  assert.equal(custom.validateCustom(schema, { days: '0.25' }, { full: false }).length, 1)
})
test('模板升级只保留同名同类型字段；删除选项、改类型与移除字段清空提示', () => {
  const old = { fields: [{ key: 'a', label: '保留', type: 'TEXT' }, { key: 'b', label: '改类型', type: 'NUMBER' }, { key: 'c', label: '已移除', type: 'TEXT' }, { key: 'd', label: '选项', type: 'RADIO' }, { key: 'proof', label: '附件', type: 'ATTACHMENT' }] }
  const next = { fields: [{ key: 'a', label: '保留', type: 'TEXT' }, { key: 'b', label: '改类型', type: 'TEXT' }, { key: 'd', label: '选项', type: 'RADIO', options: [{ value: 'NEW' }] }, { key: 'proof', label: '附件', type: 'ATTACHMENT' }] }
  const merged = custom.mergeValues(old, { a: '保留值', b: '2', c: '旧值', d: 'OLD', proof: [8] }, next)
  assert.equal(merged.values.a, '保留值'); assert.equal(merged.values.b, null); assert.equal(merged.values.d, null)
  assert.equal(merged.values.proof.join(','), '8'); assert.equal(merged.dropped.length, 3)
})

test('自定义数值步长按十进制精确计算，不受浮点误差影响', () => {
  const schema = { fields: [{ key: 'n', label: '数值', type: 'NUMBER', rules: { min: '0.1', step: '0.2', precision: 1 } }] }
  assert.equal(custom.validateCustom(schema, { n: '0.3' }).length, 0)
  assert.equal(custom.validateCustom(schema, { n: '0.4' }).length, 1)
  assert.equal(custom.validateCustom(schema, { n: '0.4' }, { full: false }).length, 0)
})
test('自定义日期、金额与附件值的格式错误不能混入草稿', () => {
  const schema = { fields: [{ key: 'date', label: '日期', type: 'DATE' }, { key: 'amount', label: '金额', type: 'AMOUNT' }, { key: 'files', label: '附件', type: 'ATTACHMENT' }] }
  const values = { date: '2026-02-30', amount: 1.5, files: ['3'] }
  assert.equal(custom.validateCustom(schema, values, { full: false }).length, 3)
  assert.equal(time.isDateString('2024-02-29'), true)
  assert.equal(time.isDateString('2026-02-29'), false)
})
