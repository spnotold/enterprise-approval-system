import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './loadTs.mjs'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function harness() {
  const storage = new Map([['eas_at', 'at-A'], ['eas_rt', 'rt-A'], ['eas_uid', '1']])
  const refresh = deferred(), logout = deferred(), login = [], me = []
  let hooks, loginEvents = 0, redirects = 0
  const { auth, SessionChangedError } = loadTs('stores/auth.ts', {
    vue: { reactive: s => s },
    '@/lib/api': { api: {
      auth: { refresh: () => refresh.promise, logout: () => logout.promise, login: () => login.shift().promise },
      me: { get: () => me.shift().promise },
    } },
    '@/lib/http': { setAuthHooks: h => { hooks = h } },
    '@/lib/config': { CLIENT_HEADERS: {} },
    '@/utils/storage': { getItem: k => storage.get(k) ?? null, setItem: (k, v) => v === null ? storage.delete(k) : storage.set(k, v) },
    '@/utils/nav': { currentUrl: () => '/pages/home/index', goLogin: () => { redirects++ }, LOGIN_PAGE: '/pages/login/index' },
  }, { uni: { reLaunch: () => { redirects++ } } })
  auth.onLogin(() => { loginEvents++ })
  return { auth, SessionChangedError, hooks, storage, refresh, logout, login, me, events: () => loginEvents, redirects: () => redirects }
}

const tokens = id => ({ accessToken: `at-${id}`, refreshToken: `rt-${id}`, userId: id })

test('刷新进行中退出：本地立即清空，晚到响应不恢复令牌或触发跳转', async () => {
  const h = harness()
  const pending = h.auth.refresh()
  const rejected = assert.rejects(pending, h.SessionChangedError)
  const leaving = h.auth.logout()
  assert.equal(h.storage.size, 0)
  h.refresh.resolve(tokens(1))
  await rejected
  assert.equal(h.auth.state.accessToken, null)
  assert.equal(h.auth.state.refreshToken, null)
  assert.equal(h.auth.state.userId, null)
  assert.equal(h.storage.size, 0)
  assert.equal(h.redirects(), 0)
  h.logout.resolve()
  await leaving
})

test('旧刷新响应不能覆盖新账号令牌', async () => {
  const h = harness(), login = deferred(), me = deferred()
  const rejected = assert.rejects(h.auth.refresh(), h.SessionChangedError)
  h.auth.clearLocal()
  h.login.push(login); h.me.push(me)
  const signingIn = h.auth.login('B', 'password')
  login.resolve(tokens(2)); me.resolve({ id: 2 })
  await signingIn
  h.refresh.resolve(tokens(1))
  await rejected
  assert.equal(h.storage.get('eas_at'), 'at-2')
  assert.equal(h.storage.get('eas_rt'), 'rt-2')
  assert.equal(h.storage.get('eas_uid'), '2')
  assert.equal(h.auth.state.me.id, 2)
})

test('登录接口晚到且已退出：不写入令牌、不通知登录成功', async () => {
  const h = harness(), login = deferred()
  h.login.push(login)
  const rejected = assert.rejects(h.auth.login('A', 'password'), h.SessionChangedError)
  h.auth.clearLocal()
  login.resolve(tokens(1))
  await rejected
  assert.equal(h.storage.size, 0)
  assert.equal(h.events(), 0)
})

test('登录的 me 请求晚到：退出并重登后不覆盖新账号或广播旧登录事件', async () => {
  const h = harness(), loginA = deferred(), meA = deferred(), loginB = deferred(), meB = deferred()
  h.login.push(loginA, loginB); h.me.push(meA, meB)
  const rejected = assert.rejects(h.auth.login('A', 'password'), h.SessionChangedError)
  loginA.resolve(tokens(1))
  await new Promise(resolve => setImmediate(resolve))
  h.auth.clearLocal()
  const signingIn = h.auth.login('B', 'password')
  loginB.resolve(tokens(2)); meB.resolve({ id: 2 })
  await signingIn
  meA.resolve({ id: 1 })
  await rejected
  assert.equal(h.auth.state.me.id, 2)
  assert.equal(h.storage.get('eas_uid'), '2')
  assert.equal(h.events(), 1)
})

test('ensureMe 旧请求结束不清除新请求的单飞状态，也不回写旧用户', async () => {
  const h = harness(), oldMe = deferred(), newMe = deferred()
  h.me.push(oldMe, newMe)
  const old = h.auth.ensureMe()
  h.auth.clearLocal()
  h.auth.state.accessToken = 'at-B'
  const current = h.auth.ensureMe()
  oldMe.resolve({ id: 1 })
  assert.equal(await old, null)
  assert.equal(h.auth.ensureMe(), current)
  newMe.resolve({ id: 2 })
  await current
  assert.equal(h.auth.state.me.id, 2)
})

test('旧退出接口晚到不会把已登录的新账号跳回登录页', async () => {
  const h = harness(), login = deferred(), me = deferred()
  const leaving = h.auth.logout()
  h.login.push(login); h.me.push(me)
  const signingIn = h.auth.login('B', 'password')
  login.resolve(tokens(2)); me.resolve({ id: 2 })
  await signingIn
  h.logout.resolve()
  await leaving
  assert.equal(h.redirects(), 0)
  assert.equal(h.auth.state.accessToken, 'at-2')
})
