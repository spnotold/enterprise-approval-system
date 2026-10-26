import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './loadTs.mjs'

const {
  resolveApplyIllustrationKey,
  applyIllustrationUrl,
} = loadTs('utils/applyIllustration.ts')

test('内置三类按 bizType 识别', () => {
  const purchaseTpl = { bizType: 'PURCHASE', code: 'TPL_P', name: '采购申请' }
  const travelTpl = { bizType: 'TRAVEL', code: 'TPL_T', name: '差旅申请' }
  const expenseTpl = { bizType: 'EXPENSE', code: 'TPL_E', name: '报销申请' }

  assert.equal(resolveApplyIllustrationKey(purchaseTpl), 'purchase')
  assert.equal(applyIllustrationUrl(purchaseTpl), '/static/illustrations/apply-purchase.jpg')

  assert.equal(resolveApplyIllustrationKey(travelTpl), 'travel')
  assert.equal(applyIllustrationUrl(travelTpl), '/static/illustrations/apply-travel.jpg')

  assert.equal(resolveApplyIllustrationKey(expenseTpl), 'expense')
  assert.equal(applyIllustrationUrl(expenseTpl), '/static/illustrations/apply-expense.jpg')
})

test('自定义模板：按 code 规则匹配请假和用章', () => {
  const leaveByCode = { bizType: 'CUSTOM', code: 'CUSTOM_LEAVE_FORM', name: '请假表' }
  const sealByCode = { bizType: 'CUSTOM', code: 'DEPT_SEAL_APPLY', name: '部门用印' }
  const stampByCode = { bizType: 'CUSTOM', code: 'COMPANY_STAMP', name: '盖印' }

  assert.equal(resolveApplyIllustrationKey(leaveByCode), 'leave')
  assert.equal(applyIllustrationUrl(leaveByCode), '/static/illustrations/apply-leave.jpg')

  assert.equal(resolveApplyIllustrationKey(sealByCode), 'seal')
  assert.equal(applyIllustrationUrl(sealByCode), '/static/illustrations/apply-seal.jpg')

  assert.equal(resolveApplyIllustrationKey(stampByCode), 'seal')
  assert.equal(applyIllustrationUrl(stampByCode), '/static/illustrations/apply-seal.jpg')
})

test('自定义模板：按名称规则匹配请假和用章', () => {
  const leaveByName1 = { bizType: 'CUSTOM', code: 'C_001', name: '员工请假' }
  const leaveByName2 = { bizType: 'CUSTOM', code: 'C_002', name: '年假休假审批' }
  const sealByName1 = { bizType: 'CUSTOM', code: 'C_003', name: '公章用章审批' }
  const sealByName2 = { bizType: 'CUSTOM', code: 'C_004', name: '合同印章使用' }
  const sealByName3 = { bizType: 'CUSTOM', code: 'C_005', name: '财务盖章单' }

  assert.equal(resolveApplyIllustrationKey(leaveByName1), 'leave')
  assert.equal(resolveApplyIllustrationKey(leaveByName2), 'leave')
  assert.equal(resolveApplyIllustrationKey(sealByName1), 'seal')
  assert.equal(resolveApplyIllustrationKey(sealByName2), 'seal')
  assert.equal(resolveApplyIllustrationKey(sealByName3), 'seal')
})

test('自定义模板：未匹配到任何规则时使用兜底 generic', () => {
  const otherTpl = { bizType: 'CUSTOM', code: 'GENERAL_MEMO', name: '通用备忘录' }
  const emptyTpl = { bizType: 'CUSTOM', code: '', name: '' }

  assert.equal(resolveApplyIllustrationKey(otherTpl), 'generic')
  assert.equal(applyIllustrationUrl(otherTpl), '/static/illustrations/apply-generic.jpg')

  assert.equal(resolveApplyIllustrationKey(emptyTpl), 'generic')
  assert.equal(applyIllustrationUrl(emptyTpl), '/static/illustrations/apply-generic.jpg')
})

test('优先级：业务类型 > 编码 > 名称；编码按完整分段、不分大小写', () => {
  // 内置类型优先于编码和名称
  assert.equal(resolveApplyIllustrationKey({ bizType: 'TRAVEL', code: 'TRAVEL_EXTRA', name: '补充采购' }), 'travel')
  // 编码优先于名称
  assert.equal(resolveApplyIllustrationKey({ bizType: 'CUSTOM', code: 'custom_leave', name: '用章申请' }), 'leave')
  // 名称里「报销」排在「差旅」前面
  assert.equal(resolveApplyIllustrationKey({ bizType: 'CUSTOM', code: 'C_9', name: '差旅报销' }), 'expense')
  // 只认完整分段：TIMESTAMP 不是 STAMP，SEALANT 不是 SEAL
  assert.equal(resolveApplyIllustrationKey({ bizType: 'CUSTOM', code: 'TIMESTAMP', name: '记录' }), 'generic')
  assert.equal(resolveApplyIllustrationKey({ bizType: 'CUSTOM', code: 'SEALANT', name: '密封胶' }), 'generic')
  // 编码别名与自定义的采购 / 差旅 / 报销
  assert.equal(resolveApplyIllustrationKey({ bizType: 'CUSTOM', code: 'IT_PROCUREMENT', name: '设备' }), 'purchase')
  assert.equal(resolveApplyIllustrationKey({ bizType: 'CUSTOM', code: 'BIZ_TRIP', name: '外勤' }), 'travel')
  assert.equal(resolveApplyIllustrationKey({ bizType: 'CUSTOM', code: 'REIMBURSE', name: '费用' }), 'expense')
  assert.equal(resolveApplyIllustrationKey({ bizType: 'CUSTOM', code: 'C_10', name: '办公用品采购' }), 'purchase')
  assert.equal(resolveApplyIllustrationKey({ bizType: 'CUSTOM', code: 'C_11', name: '出差申请' }), 'travel')
})
