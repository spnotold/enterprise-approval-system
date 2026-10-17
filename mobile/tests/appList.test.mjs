import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { ref } = require('vue')

// 页面是 <script setup> 单文件组件，这里取出脚本块，在桩环境中直接执行页面逻辑。
function loadPage() {
  const sfc = readFileSync(resolve(root, 'pages/app/list.vue'), 'utf8')
  const script = /<script setup lang="ts">([\s\S]*?)<\/script>/.exec(sfc)[1]
  const source = script + '\nmodule.exports = { scope, status, statusOptions, statusIndex, selectStatus, setScope, swipe }'
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText

  const requests = []
  const hooks = {}
  const titles = []
  const api = { applications: {
    list: async (params) => { requests.push({ ...params }); return { records: [], total: 0, page: params.page, size: params.size } },
  } }
  const noop = () => {}
  const stubs = {
    vue: require('vue'),
    '@dcloudio/uni-app': new Proxy({}, { get: (_, name) => (fn) => { hooks[name] = fn } }),
    '@/lib/api': { api },
    '@/composables/useActionPermissions': { useActionPermissions: () => ({ reset: noop, get: noop, load: noop }) },
    '@/components/SwipeCell.vue': {},
    '@/components/AppCard.vue': {},
    '@/components/EmptyState.vue': {},
    '@/composables/useSwipeTabs': {
      closeSwipeCells: noop,
      useSwipeTabs: (index, count, select) => ({ index, count, select, suppressTap: ref(false) }),
    },
    '@/composables/usePagedList': {
      usePagedList: (fetcher) => ({ items: ref([]), loaded: ref(false), moreStatus: ref('more'), reload: () => fetcher(1, 10), loadMore: noop }),
    },
    '@/lib/idem': { newIdemKey: () => 'k' },
    '@/utils/action': { runIdempotent: noop },
    '@/utils/feedback': { confirm: noop, hideLoading: noop, loading: noop, showError: noop, toast: noop },
    '@/utils/time': { fmtDateTime: noop },
    '@/utils/nav': { goDetail: noop },
    '@/utils/uniEvent': { pickerValue: noop },
    '@/stores/auth': { auth: { can: () => true }, requireLogin: async () => true },
    '@/stores/notice': { NOTICE_EVENT: 'notice' },
    '@/utils/labels': {
      APP_STATUS_LABEL: { DRAFT: '草稿', IN_APPROVAL: '审批中', APPROVED: '已通过', REJECTED: '已驳回', WITHDRAWN: '已撤回' },
      APP_STATUS_ORDER: ['DRAFT', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
      APP_TYPE_LABEL: { EXPENSE: '报销', PURCHASE: '采购' },
    },
  }
  const module = { exports: {} }
  const uni = { setNavigationBarTitle: (o) => titles.push(o.title), $on: noop, $off: noop, $emit: noop, stopPullDownRefresh: noop }
  runInNewContext('(function(require, module, exports) {\n' + js + '\n})', { uni, console, Math })(
    (id) => { if (Object.hasOwn(stubs, id)) return stubs[id]; throw new Error(`unexpected import ${id}`) }, module, module.exports,
  )
  return { page: module.exports, requests, hooks, titles }
}

const values = (page) => plain(page.statusOptions.value.map((o) => o.value))
const last = (requests) => requests[requests.length - 1]

test('本人范围提供草稿选项，并按所选草稿请求', () => {
  const { page, requests } = loadPage()
  assert.deepEqual(values(page), [null, 'DRAFT', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN'])
  page.selectStatus(1)
  assert.equal(page.status.value, 'DRAFT')
  assert.equal(last(requests).scope, 'mine')
  assert.equal(last(requests).status, 'DRAFT')
})

test('非本人范围不显示草稿选项，滑动切换的数量同步减少', () => {
  const { page } = loadPage()
  page.setScope('dept')
  assert.deepEqual(values(page), [null, 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN'])
  assert.equal(page.swipe.count(), 5)
  page.setScope('granted')
  assert.equal(values(page).includes('DRAFT'), false)
  page.setScope('mine')
  assert.equal(page.swipe.count(), 6)
})

test('从草稿切到非本人范围时重置为全部，且不会发出草稿请求', () => {
  const { page, requests, titles } = loadPage()
  page.selectStatus(1)
  page.setScope('dept')
  assert.equal(page.scope.value, 'dept')
  assert.equal(page.status.value, null)
  assert.equal(page.statusIndex.value, 0)
  assert.deepEqual(plain(last(requests)), { scope: 'dept', page: 1, size: 10, type: null, status: null, keyword: null })
  assert.deepEqual(titles, ['本部门申请'])
})

test('切换范围保留非草稿状态，状态下标随选项对应', () => {
  const { page, requests } = loadPage()
  page.selectStatus(3)
  assert.equal(page.status.value, 'APPROVED')
  page.setScope('granted')
  assert.equal(page.status.value, 'APPROVED')
  assert.equal(page.statusIndex.value, 2)
  assert.equal(last(requests).status, 'APPROVED')
})

test('从非本人范围回到本人范围后可重新选择草稿', () => {
  const { page, requests } = loadPage()
  page.setScope('dept')
  page.setScope('mine')
  assert.equal(page.status.value, null)
  page.selectStatus(1)
  assert.equal(last(requests).status, 'DRAFT')
  assert.equal(last(requests).scope, 'mine')
})

test('带 status=DRAFT 进入部门范围时重置，不向后端发草稿', async () => {
  const { page, requests, hooks } = loadPage()
  await hooks.onLoad({ status: 'DRAFT', scope: 'dept' })
  assert.equal(page.status.value, null)
  assert.ok(requests.length > 0)
  assert.ok(requests.every((r) => !(r.scope !== 'mine' && r.status === 'DRAFT')))
  assert.equal(last(requests).scope, 'dept')
  assert.equal(last(requests).status, null)
})

test('带 status=DRAFT 进入本人范围时保留草稿筛选', async () => {
  const { page, requests, hooks } = loadPage()
  await hooks.onLoad({ status: 'DRAFT' })
  assert.equal(page.status.value, 'DRAFT')
  assert.equal(page.statusIndex.value, 1)
  assert.equal(last(requests).scope, 'mine')
  assert.equal(last(requests).status, 'DRAFT')
})

function plain(v) { return JSON.parse(JSON.stringify(v)) }
