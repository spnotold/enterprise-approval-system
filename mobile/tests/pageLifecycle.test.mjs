import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const flush = () => new Promise(setImmediate)
const deferred = () => {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

// 执行真实页面脚本，用可控响应验证刷新乱序和页面生命周期。
function harness(kind = 'app/detail') {
  const source = readFileSync(new URL(`../pages/${kind}.vue`, import.meta.url), 'utf8')
  const script = /<script setup lang="ts">([\s\S]*?)<\/script>/.exec(source)[1]
  const exposed = kind === 'app/detail' ? 'detail, notFound, load' : 'onDone'
  const js = ts.transpileModule(`${script}\nmodule.exports = { ${exposed} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
  const hooks = {}, listeners = new Map(), requests = [], timers = new Map(), navigated = [], errors = []
  const originalPage = {}
  let pages = [originalPage]
  const noop = () => {}
  const uni = {
    $on: (name, fn) => listeners.set(name, fn), $off: name => listeners.delete(name),
    $emit: (name, id) => listeners.get(name)?.(id), stopPullDownRefresh: noop,
    navigateBack: () => navigated.push('back'), switchTab: () => navigated.push('tab'),
  }
  const stubs = {
    vue: require('vue'),
    '@dcloudio/uni-app': { onLoad: fn => { hooks.load = fn }, onUnload: fn => { hooks.unload = fn }, onPullDownRefresh: noop },
    '@/lib/api': { api: { applications: { detail: () => { const r = deferred(); requests.push(r); return r.promise } } } },
    '@/lib/http': { toApiError: err => err },
    '@/lib/idem': { newIdemKey: noop },
    '@/composables/useDraft': { pathPreviewText: noop },
    '@/stores/auth': { requireLogin: async () => true },
    '@/stores/notice': { NOTICE_EVENT: 'notice' },
    '@/utils/action': { runIdempotent: noop },
    '@/utils/feedback': { alert: noop, confirm: noop, hideLoading: noop, loading: noop, showError: e => errors.push(e), toast: noop },
    '@/utils/labels': { ACTION_LABEL: {} }, '@/utils/nav': { goForm: noop }, '@/utils/time': { fmtDateTime: noop },
  }
  const module = { exports: {} }
  runInNewContext('(function(require, module, exports) {\n' + js + '\n})', {
    uni, getCurrentPages: () => pages,
    setTimeout: fn => { timers.set(1, fn); return 1 }, clearTimeout: id => timers.delete(id),
  })((id) => { if (id in stubs) return stubs[id]; throw new Error(`unexpected import ${id}`) }, module, module.exports)
  return {
    page: module.exports, requests, timers, navigated, errors, uni, unload: () => hooks.unload(),
    hide: () => { pages = [...pages, {}] },
    start: async () => {
      const loading = hooks.load({ id: '17' })
      await flush()
      requests[0].resolve({ id: 17, version: 1, status: 'DRAFT', allowedActions: ['EDIT'] })
      await loading
    },
  }
}

test('保存、提交连续通知时，详情忽略晚到的旧版本且不重复发事件', async () => {
  const h = harness(); await h.start()
  h.uni.$emit('eas:app-changed', 17)
  h.uni.$emit('eas:app-changed', 17)
  h.requests[2].resolve({ id: 17, version: 3, status: 'IN_APPROVAL', allowedActions: [] })
  await flush()
  h.requests[1].resolve({ id: 17, version: 2, status: 'DRAFT', allowedActions: ['EDIT'] })
  await flush()
  assert.equal(h.page.detail.value.version, 3)
  assert.equal(h.page.detail.value.status, 'IN_APPROVAL')
  assert.equal(h.requests.length, 3)
})

test('旧详情请求的错误不覆盖最新成功结果，卸载后响应不更新页面', async () => {
  const h = harness(); await h.start()
  const old = h.page.load(true), current = h.page.load(true)
  h.requests[2].resolve({ id: 17, version: 3 }); await current
  h.requests[1].reject({ code: 40401 }); await old
  assert.equal(h.page.notFound.value, false); assert.deepEqual(h.errors, [])
  const pending = h.page.load(true)
  h.unload(); h.requests[3].resolve({ id: 17, version: 4 }); await pending
  assert.equal(h.page.detail.value.version, 3)
})

test('审批页卸载取消延时返回，请求期间打开其他页面也不安排导航', async () => {
  const h = harness('task/handle'); await h.start()
  const result = { applicationId: 17, status: 'APPROVED', currentNode: null }
  h.hide(); h.page.onDone(result, 'approve')
  assert.equal(h.timers.size, 0)
  const active = harness('task/handle'); await active.start()
  active.page.onDone(result, 'approve')
  assert.equal(active.timers.size, 1)
  active.unload()
  assert.equal(active.timers.size, 0); assert.deepEqual(active.navigated, [])
})
