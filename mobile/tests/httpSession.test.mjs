import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './loadTs.mjs'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

function harness() {
  let gen = 0, token = 'A', failures = 0
  const calls = [], refreshes = []
  const http = loadTs('lib/http.ts', { './config': { API_BASE: '/api', CLIENT_HEADERS: {} } }, {
    uni: { request: options => { calls.push(options) } },
  })
  http.setAuthHooks({
    getAccessToken: () => token, sessionGeneration: () => gen,
    refresh: () => { const pending = deferred(); refreshes.push(pending); return pending.promise },
    onAuthFailure: () => { failures++ },
  })
  return { ...http, calls, refreshes, switchAccount: () => { gen++; token = 'B' },
    failureCount: () => failures, expire: (i, code = 40102) => calls[i].success({ statusCode: 401, data: { code } }) }
}

test('旧会话晚到的 40101 / 40102 不刷新、不用新身份重放、不登出新账号', async () => {
  for (const code of [40101, 40102]) {
    const h = harness(), request = h.http.get('/me')
    const rejected = assert.rejects(request, e => e.code === code)
    h.switchAccount(); h.expire(0, code)
    await rejected
    assert.equal(h.calls.length, 1)
    assert.equal(h.refreshes.length, 0)
    assert.equal(h.failureCount(), 0)
  }
})

test('刷新等待期间切换账号：刷新成功或失败均不重放、不触发新会话失效', async () => {
  for (const success of [true, false]) {
    const h = harness(), rejected = assert.rejects(h.http.get('/me'), e => e.code === 40102)
    h.expire(0); await tick()
    h.switchAccount()
    if (success) h.refreshes[0].resolve()
    else h.refreshes[0].reject(new Error('旧刷新失败'))
    await rejected
    assert.equal(h.calls.length, 1)
    assert.equal(h.failureCount(), 0)
  }
})

test('单飞刷新按代次隔离，旧刷新结束不清除新会话进行中的刷新', async () => {
  const h = harness(), old = h.refreshOnce()
  assert.equal(h.refreshOnce(), old)
  h.switchAccount()
  const current = h.refreshOnce()
  assert.notEqual(old, current)
  h.refreshes[0].resolve(); await old
  assert.equal(h.refreshOnce(), current)
  assert.equal(h.refreshes.length, 2)
  h.refreshes[1].resolve(); await current
})

test('401 重放后切换账号，重放响应失效不清空新会话', async () => {
  const h = harness(), rejected = assert.rejects(h.http.get('/me'), e => e.code === 40101)
  h.expire(0); await tick()
  h.refreshes[0].resolve(); await tick()
  assert.equal(h.calls.length, 2)
  h.switchAccount(); h.expire(1, 40101)
  await rejected
  assert.equal(h.failureCount(), 0)
})

test('同一会话 40102 仍共享刷新并正常重放，失效时仍通知退出', async () => {
  const h = harness(), first = h.http.get('/one'), second = h.http.get('/two')
  h.expire(0); h.expire(1); await tick()
  assert.equal(h.refreshes.length, 1)
  h.refreshes[0].resolve(); await tick()
  h.calls[2].success({ statusCode: 200, data: { code: 0, data: 'one' } })
  const rejected = assert.rejects(second, e => e.code === 40101)
  h.expire(3, 40101)
  assert.equal(await first, 'one')
  await rejected
  assert.equal(h.failureCount(), 1)
})
