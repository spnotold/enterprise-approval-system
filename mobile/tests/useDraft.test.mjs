import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive } from 'vue'
import { loadTs } from './loadTs.mjs'

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const tick = () => new Promise(r => setTimeout(r, 5))
function harness() {
  const calls = [], confirmations = [], unloaded = []
  let confirmResult = true, createResult = null, preview = { nodes: [], errors: [] }
  class ApiError extends Error { constructor(body) { super(body.message); this.code = body.code } }
  const api = { applications: {
    create: async (type, body) => { calls.push({ op: 'create', type, body }); return createResult ? createResult.promise : { id: 1, version: 1, appNo: 'TEST' } },
    save: async (id, type, body) => { calls.push({ op: 'save', id, type, body }); return { id, version: body.version + 1, appNo: 'TEST' } },
    pathPreview: async () => preview,
    submit: async (id, body, key) => { calls.push({ op: 'submit', id, body, key }); return { applicationId: id, status: 'IN_APPROVAL', appVersion: body.appVersion + 1, currentNode: null } },
    detail: async () => ({ id: 1, type: 'EXPENSE', status: 'DRAFT', allowedActions: ['EDIT'], version: 4, appNo: 'TEST' }),
  } }
  const feedback = { alert: async () => {}, confirm: async o => { confirmations.push(o); return confirmResult }, toast: () => {}, loading: () => {}, hideLoading: () => {} }
  const { useDraft } = loadTs('composables/useDraft.ts', {
    '@dcloudio/uni-app': { onUnload: fn => unloaded.push(fn) }, '@/lib/api': { api }, '@/lib/http': { ApiError },
    '@/lib/idem': { newIdemKey: () => 'idem-test' }, '@/utils/feedback': feedback, '@/utils/nav': { goDetail: () => {} },
    '@/utils/action': { runIdempotent: async (key, fn) => fn(key) },
  }, { uni: {}, window: {} })
  return { useDraft, calls, confirmations, setConfirm: v => { confirmResult = v }, setCreate: v => { createResult = v }, setPreview: v => { preview = v } }
}

test('新建后带草稿版本保存，提交使用保存响应版本并展示路径', async () => {
  const h = harness(), d = h.useDraft('expense')
  await d.save({ title: '草稿', items: [] })
  h.setPreview({ errors: [], nodes: [{ name: '会签', effective: true, mode: 'COUNTERSIGN', candidates: [{ realName: '甲' }, { realName: '乙' }] }] })
  await d.submit({ title: '更新草稿', items: [] })
  assert.equal(h.calls[1].body.version, 1); assert.equal(h.calls[2].body.appVersion, 2)
  assert.equal(h.calls[2].key, 'idem-test'); assert.match(h.confirmations[0].content, /甲、乙/)
  assert.equal(d.draft.busy, false)
})
test('保存期间的修改不能被响应标成已保存；并发操作被拦截', async () => {
  const h = harness(), d = h.useDraft('expense'), form = reactive({ title: '' })
  d.trackDirty(() => form); d.startTracking(); await tick()
  form.title = '保存时内容'
  const pending = deferred(); h.setCreate(pending)
  const first = d.save({ title: form.title })
  await assert.rejects(d.save({ title: '重复点击' }), e => e.code === 40903)
  form.title = '请求中继续编辑'
  pending.resolve({ id: 1, version: 1, appNo: 'TEST' }); await first
  assert.equal(d.draft.dirty, true); assert.equal(h.calls.length, 1)
})
test('取消确认或路径解析错误时仅保存，不执行提交', async () => {
  const h = harness(), d = h.useDraft('expense')
  h.setConfirm(false); assert.equal(await d.submit({ title: '草稿' }), null)
  h.setPreview({ nodes: [], errors: ['审批人未配置'] })
  assert.equal(await d.submit({ title: '草稿' }), null)
  assert.equal(h.calls.filter(c => c.op === 'submit').length, 0); assert.equal(d.draft.busy, false)
})
test('确认期间表单变化时需重新提交，禁止提交过时快照', async () => {
  const h = harness(), d = h.useDraft('expense'), form = reactive({ title: '初始' })
  d.trackDirty(() => form); d.startTracking(); await tick()
  const r = await d.submit({ title: form.title }, { afterSave: async () => { form.title = '已更改'; return '疑似重复票据' } })
  assert.equal(r, null); assert.equal(h.calls.some(c => c.op === 'submit'), false)
  assert.match(h.confirmations[0].content, /疑似重复票据/)
})
test('草稿类型不匹配不进入编辑', async () => {
  const h = harness(), d = h.useDraft('purchase')
  await assert.rejects(d.load(1), /类型与当前表单不匹配/)
  assert.equal(d.draft.id, null)
})
