import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './loadTs.mjs'

const g = loadTs('utils/slideGesture.ts')
const MAX = 200

function run(events, state = g.initialSlide()) {
  const effects = []
  for (const e of events) {
    const r = g.reduceSlide(state, e)
    state = r.state
    if (r.effect) effects.push(r.effect)
  }
  return { state, effects }
}
const drag = (to) => [{ type: 'start', x: 10, y: 50 }, { type: 'move', x: 10 + to / 2, y: 50, maxLeft: MAX }, { type: 'move', x: 10 + to, y: 52, maxLeft: MAX }]

test('touchend 在 ≥90% 处确认，滑块停在末端', () => {
  const { state, effects } = run([...drag(MAX * 0.9), { type: 'end', maxLeft: MAX }])
  assert.deepEqual(effects, ['confirm'])
  assert.equal(state.phase, 'confirmed')
  assert.equal(state.left, MAX)
})

test('拖过头被截在末端，松手仍确认', () => {
  const { state, effects } = run([...drag(MAX * 3), { type: 'end', maxLeft: MAX }])
  assert.deepEqual(effects, ['confirm'])
  assert.equal(state.left, MAX)
})

test('touchend 在 <90% 处回弹，不确认也不提示', () => {
  const { state, effects } = run([...drag(MAX * 0.89), { type: 'end', maxLeft: MAX }])
  assert.deepEqual(effects, [])
  assert.equal(state.phase, 'idle')
  assert.equal(state.left, 0)
})

test('touchcancel 在任意位置都只回弹、不确认', () => {
  for (const ratio of [0, 0.3, 0.89, 0.9, 0.95, 1, 2]) {
    const { state, effects } = run([...drag(MAX * ratio), { type: 'cancel' }])
    assert.deepEqual(effects, [], `ratio ${ratio}`)
    assert.equal(state.phase, 'idle')
    assert.equal(state.left, 0)
    // 打断后迟到的 touchend 也不能补确认
    assert.deepEqual(run([{ type: 'end', maxLeft: MAX }], state).effects, [])
  }
})

test('单点不拖动松手：回弹并提示操作方式', () => {
  const { state, effects } = run([{ type: 'start', x: 10, y: 10 }, { type: 'end', maxLeft: MAX }])
  assert.deepEqual(effects, ['hint'])
  assert.equal(state.phase, 'idle')
})

test('轨道宽度未测出时不确认', () => {
  const { effects } = run([{ type: 'start', x: 0, y: 0 }, { type: 'move', x: 100, y: 0, maxLeft: 0 }, { type: 'end', maxLeft: 0 }])
  assert.deepEqual(effects, [])
})

test('键盘需两次按键才确认，第一次只进入待确认', () => {
  const once = run([{ type: 'key', maxLeft: MAX }])
  assert.deepEqual(once.effects, ['arm'])
  assert.equal(once.state.phase, 'armed')
  assert.equal(once.state.left, 0)
  const twice = run([{ type: 'key', maxLeft: MAX }], once.state)
  assert.deepEqual(twice.effects, ['confirm'])
  assert.equal(twice.state.phase, 'confirmed')
  assert.equal(twice.state.left, MAX)
})

test('待确认被取消（超时 / 失焦 / Esc）或开始拖动后，单次按键不会确认', () => {
  const armed = run([{ type: 'key', maxLeft: MAX }]).state
  for (const interrupt of [{ type: 'disarm' }, { type: 'start', x: 0, y: 0 }]) {
    const r = run([interrupt, ...(interrupt.type === 'start' ? [{ type: 'cancel' }] : []), { type: 'key', maxLeft: MAX }], armed)
    assert.deepEqual(r.effects, ['arm'])
    assert.equal(r.state.phase, 'armed')
  }
})

test('拖动中按键不影响手势', () => {
  const { state, effects } = run([...drag(MAX * 0.5), { type: 'key', maxLeft: MAX }, { type: 'key', maxLeft: MAX }])
  assert.deepEqual(effects, [])
  assert.equal(state.phase, 'dragging')
})

test('已确认后忽略任何手势与按键，reset 才复位', () => {
  const done = run([...drag(MAX), { type: 'end', maxLeft: MAX }]).state
  const again = run([...drag(MAX), { type: 'end', maxLeft: MAX }, { type: 'key', maxLeft: MAX }, { type: 'cancel' }], done)
  assert.deepEqual(again.effects, [])
  assert.equal(again.state.phase, 'confirmed')
  const reset = run([{ type: 'reset' }], done).state
  assert.equal(reset.phase, 'idle')
  assert.equal(reset.left, 0)
})

test('未开始拖动时的 move 被忽略', () => {
  const { state } = run([{ type: 'move', x: 150, y: 0, maxLeft: MAX }])
  assert.equal(state.left, 0)
  assert.equal(state.phase, 'idle')
})
