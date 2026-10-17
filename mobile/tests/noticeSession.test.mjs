import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './loadTs.mjs'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const item = id => ({ id, title: `通知 ${id}`, type: 'SYSTEM', applicationId: null, linkPath: null })

function harness() {
  const lists = [], counts = [], changes = [], tickets = [], sources = [], toasts = [], events = [], timers = new Set()
  const api = {
    notifications: {
      list: () => { const pending = deferred(); lists.push(pending); return pending.promise },
      unreadCount: () => { const pending = deferred(); counts.push(pending); return pending.promise },
      changes: since => { const pending = deferred(); changes.push({ ...pending, since }); return pending.promise },
    },
    auth: { sseTicket: () => { const pending = deferred(); tickets.push(pending); return pending.promise } },
  }
  const uni = { setTabBarBadge() {}, removeTabBarBadge() {}, showToast: o => toasts.push(o), $emit: (...args) => events.push(args) }
  const stubs = { vue: { reactive: s => s }, '@/lib/api': { api }, '@/utils/nav': { NOTICE_TAB_INDEX: 2 }, '@/lib/config': { API_BASE: '/api' } }
  const { notice } = loadTs('stores/notice.ts', stubs, { uni })
  class EventSource {
    constructor(url) { this.url = url; this.listeners = {}; sources.push(this) }
    addEventListener(event, callback) { this.listeners[event] = callback }
    close() { this.closed = true }
    emit(event, data) { this.listeners[event]?.({ data: JSON.stringify(data) }) }
  }
  const { realtime } = loadTs('stores/realtime.ts', { ...stubs, './notice': { notice } }, {
    EventSource, setInterval: fn => { timers.add(fn); return fn }, clearInterval: fn => timers.delete(fn),
    setTimeout: fn => { timers.add(fn); return fn }, clearTimeout: fn => timers.delete(fn),
  })
  const init = (index, id, unread) => { lists[index].resolve({ records: [item(id)] }); counts[index].resolve({ count: unread }) }
  return { notice, realtime, lists, counts, changes, tickets, sources, toasts, events, timers, init }
}

test('通知初始化请求晚到：退出并启动新账号后不覆盖未读数、游标或去重集合', async () => {
  const h = harness()
  h.realtime.start()
  h.realtime.stop(); h.realtime.start()
  h.init(1, 20, 2); await tick()
  h.changes[0].resolve({ items: [], unreadCount: 2 }); await tick()
  h.init(0, 100, 99); await tick()
  assert.equal(h.notice.state.unread, 2)
  assert.equal(h.notice.state.lastId, 20)
  assert.equal(h.changes.length, 1)
  assert.equal(h.toasts.length, 0)
  h.notice.receive([item(100)], 3)
  assert.equal(h.toasts.length, 1) // 旧初始化没有污染新会话的去重集合
  h.realtime.stop()
})

test('旧账号增量请求晚到：不改新账号未读数、不弹提示、不广播事件', async () => {
  const h = harness()
  h.realtime.start(); h.init(0, 10, 1); await tick()
  assert.equal(h.changes.length, 1)
  h.realtime.stop(); h.realtime.start(); h.init(1, 20, 2); await tick()
  assert.equal(h.changes.length, 2) // 旧在途请求不阻塞新账号轮询
  h.changes[0].resolve({ items: [item(100)], unreadCount: 99 }); await tick()
  assert.equal(h.notice.state.unread, 2)
  assert.equal(h.notice.state.lastId, 20)
  assert.equal(h.toasts.length, 0)
  assert.equal(h.events.length, 0)
  const pending = h.realtime.pull()
  assert.equal(h.changes.length, 2) // 旧请求 finally 不释放新请求的 polling 标记
  await pending
  h.changes[1].resolve({ items: [item(21)], unreadCount: 3 }); await tick()
  assert.equal(h.notice.state.unread, 3)
  assert.equal(h.toasts.length, 1)
  assert.equal(h.events.length, 1)
  h.realtime.stop()
})

test('旧 SSE 票据晚到或失败不建立旧连接、不关闭新连接或安排重试', async () => {
  for (const success of [true, false]) {
    const h = harness()
    h.realtime.start(); h.init(0, 10, 1); await tick()
    h.realtime.stop(); h.realtime.start(); h.init(1, 20, 2); await tick()
    h.tickets[1].resolve({ ticket: 'B' }); await tick()
    if (success) h.tickets[0].resolve({ ticket: 'A' })
    else h.tickets[0].reject(new Error('旧连接失败'))
    await tick()
    assert.equal(h.sources.length, 1)
    assert.match(h.sources[0].url, /ticket=B$/)
    assert.equal(h.sources[0].closed, undefined)
    assert.equal(h.timers.size, 1)
    h.realtime.stop()
  }
})

test('已关闭的旧 SSE 连接晚到通知不能弹出提示或改变未读数', async () => {
  const h = harness()
  h.realtime.start(); h.init(0, 10, 1); await tick()
  h.tickets[0].resolve({ ticket: 'A' }); await tick()
  const oldSource = h.sources[0]
  h.realtime.stop(); h.realtime.start(); h.init(1, 20, 2); await tick()
  oldSource.emit('notification', { ...item(100), unreadCount: 99 })
  oldSource.emit('open')
  assert.equal(h.notice.state.unread, 2)
  assert.equal(h.notice.state.lastId, 20)
  assert.equal(h.toasts.length, 0)
  assert.equal(h.events.length, 0)
  assert.equal(h.changes.length, 2)
  h.realtime.stop()
})
