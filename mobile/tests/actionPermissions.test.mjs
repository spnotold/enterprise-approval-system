import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './loadTs.mjs'

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const { useActionPermissions } = loadTs('composables/useActionPermissions.ts')
const plain = (v) => JSON.parse(JSON.stringify(v))
const app = (over = {}) => ({ id: 1, version: 3, status: 'IN_APPROVAL', ...over })
const detail = (over = {}) => ({ id: 1, version: 3, status: 'IN_APPROVAL', allowedActions: ['URGE', 'WITHDRAW'], ...over })

function harness() {
  const calls = []
  const pending = []
  const p = useActionPermissions((id) => { const d = deferred(); calls.push(id); pending.push(d); return d.promise })
  return { p, calls, pending }
}

test('未加载时没有缓存；加载中不重复请求，结果按需缓存', async () => {
  const { p, calls, pending } = harness()
  assert.equal(p.get(app()), undefined)
  assert.equal(calls.length, 0)
  const first = p.load(app())
  p.load(app())
  assert.deepEqual(calls, [1])
  assert.equal(p.get(app()).state, 'loading')
  pending[0].resolve(detail())
  await first
  assert.deepEqual(plain(p.get(app())), { state: 'ready', actions: ['URGE', 'WITHDRAW'] })
  await p.load(app())
  assert.equal(calls.length, 1)
})

test('列表项版本或状态变化后缓存失效，需重新加载', async () => {
  const { p, calls, pending } = harness()
  const l = p.load(app())
  pending[0].resolve(detail())
  await l
  assert.equal(p.get(app({ version: 4 })), undefined)
  assert.equal(p.get(app({ status: 'APPROVED' })), undefined)
  const l2 = p.load(app({ version: 4 }))
  assert.equal(calls.length, 2)
  pending[1].resolve(detail({ version: 4, allowedActions: ['URGE'] }))
  await l2
  assert.deepEqual(plain(p.get(app({ version: 4 })).actions), ['URGE'])
  assert.equal(p.get(app()), undefined)
})

test('reset（列表刷新）清空缓存', async () => {
  const { p, calls, pending } = harness()
  const l = p.load(app())
  pending[0].resolve(detail())
  await l
  p.reset()
  assert.equal(p.get(app()), undefined)
  p.load(app())
  assert.equal(calls.length, 2)
})

test('reset 之前发出的请求，晚到的响应被丢弃', async () => {
  const { p, pending } = harness()
  const old = p.load(app())
  p.reset()
  const fresh = p.load(app())
  pending[1].resolve(detail({ allowedActions: ['URGE'] }))
  await fresh
  pending[0].resolve(detail({ allowedActions: ['WITHDRAW'] }))
  await old
  assert.deepEqual(plain(p.get(app()).actions), ['URGE'])
})

test('reset 后旧响应不会写入缓存，失败的旧请求也不会覆盖', async () => {
  const { p, pending } = harness()
  const a = p.load(app())
  const b = p.load(app({ id: 2 }))
  p.reset()
  pending[0].resolve(detail())
  pending[1].reject(new Error('timeout'))
  await Promise.all([a, b])
  assert.equal(p.get(app()), undefined)
  assert.equal(p.get(app({ id: 2 })), undefined)
})

test('同一申请的版本变化后，旧版本的晚到响应被丢弃', async () => {
  const { p, pending } = harness()
  const v3 = p.load(app())
  const v4 = p.load(app({ version: 4 }))
  pending[1].resolve(detail({ version: 4, allowedActions: ['URGE'] }))
  await v4
  pending[0].resolve(detail({ allowedActions: ['WITHDRAW'] }))
  await v3
  assert.deepEqual(plain(p.get(app({ version: 4 })).actions), ['URGE'])
})

test('请求失败显示 error，再次加载即重试；详情与列表项不一致也视为失败', async () => {
  const { p, calls, pending } = harness()
  const l = p.load(app())
  pending[0].reject(new Error('timeout'))
  await l
  assert.deepEqual(plain(p.get(app())), { state: 'error' })
  const retry = p.load(app())
  assert.equal(p.get(app()).state, 'loading')
  assert.equal(calls.length, 2)
  pending[1].resolve(detail({ version: 9 }))
  await retry
  assert.deepEqual(plain(p.get(app())), { state: 'error' })
  const again = p.load(app())
  pending[2].resolve(detail())
  await again
  assert.equal(p.get(app()).state, 'ready')
})
