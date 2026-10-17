<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { closeSwipeCells, openSwipeCell, swipeGesture, touchPoint, type SwipeTouchEvent } from '@/composables/useSwipeTabs'

/** disabled：占位（如“加载中”），点击无响应；keepOpen：点击后不收起（如“重试”） */
export interface SwipeAction { text: string; type?: 'primary' | 'danger' | 'muted'; key: string; disabled?: boolean; keepOpen?: boolean }
const props = defineProps<{ cellId: string; actions: SwipeAction[] }>()
// will-open：用户开始向左滑动这一行（尚未展开），可据此按需准备操作
const emit = defineEmits<{ 'content-tap': []; action: [key: string]; 'will-open': [] }>()
const offset = ref(0)
const dragging = ref(false)
const width = computed(() => uni.upx2px(144) * props.actions.length)
const style = computed(() => ({ transform: `translateX(${offset.value}px)`, transition: dragging.value ? 'none' : 'transform var(--eas-dur) var(--eas-ease)' }))
let start: { x: number; y: number } | undefined
let origin = 0
let direction: 'horizontal' | 'vertical' | undefined
let moved = false
let wasOpen = false
let willOpenEmitted = false

function close(): void { dragging.value = false; offset.value = 0 }
watch(openSwipeCell, (id) => { if (id !== props.cellId) close() })
watch(() => props.actions.length, (n, old) => {
  // 已展开时操作数量变化（如占位换成真实操作）：保持展开并按新宽度对齐
  if (n > 0 && old > 0 && !dragging.value && offset.value !== 0) { offset.value = -width.value; return }
  if (dragging.value && n > 0) return
  close()
  if (openSwipeCell.value === props.cellId) closeSwipeCells()
})
onUnmounted(() => { if (openSwipeCell.value === props.cellId) closeSwipeCells() })
function touchStart(e: SwipeTouchEvent): void {
  start = e.touches.length === 1 ? touchPoint(e) : undefined
  origin = offset.value
  wasOpen = offset.value !== 0
  direction = undefined
  moved = false
  willOpenEmitted = false
  // Starting anywhere in a new row closes the previous row, including vertical scrolls.
  if (openSwipeCell.value !== props.cellId) closeSwipeCells()
}
function touchMove(e: SwipeTouchEvent): void {
  const p = touchPoint(e)
  if (e.touches.length !== 1) { touchCancel(); return }
  if (!start || !p) return
  const dx = p.x - start.x
  const dy = p.y - start.y
  if (!direction && Math.max(Math.abs(dx), Math.abs(dy)) > 8) direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 8) moved = true
  if (direction === 'vertical') { closeSwipeCells(); close(); return }
  if (direction !== 'horizontal' || (dx > 0 && !wasOpen)) return
  if (!willOpenEmitted) { willOpenEmitted = true; emit('will-open') }
  if (!width.value) return
  swipeGesture.consumed = true
  openSwipeCell.value = props.cellId
  dragging.value = true
  offset.value = Math.max(-width.value, Math.min(0, origin + dx))
}
function touchEnd(): void {
  start = undefined
  dragging.value = false
  if (offset.value < -width.value / 2) { offset.value = -width.value; openSwipeCell.value = props.cellId }
  else { close(); if (openSwipeCell.value === props.cellId) closeSwipeCells() }
}
function touchCancel(): void { moved = true; start = undefined; close(); if (openSwipeCell.value === props.cellId) closeSwipeCells() }
function tapContent(): void {
  if (moved) return
  if (wasOpen || offset.value !== 0) { closeSwipeCells(); close(); return }
  closeSwipeCells()
  emit('content-tap')
}
function action(a: SwipeAction): void {
  if (a.disabled) return
  if (!a.keepOpen) { closeSwipeCells(); close() }
  emit('action', a.key)
}
</script>

<template>
  <view class="swipe-cell" @touchstart="touchStart" @touchmove="touchMove" @touchend="touchEnd" @touchcancel="touchCancel">
    <view v-if="actions.length" class="swipe-actions" :style="{ width: `${width}px` }">
      <view v-for="a in actions" :key="a.key" class="swipe-action" :class="[`swipe-action--${a.type ?? 'primary'}`, { 'is-disabled': a.disabled }]" :hover-class="a.disabled ? 'none' : 'is-pressed'" hover-stay-time="60" @tap.stop="action(a)">{{ a.text }}</view>
    </view>
    <view class="swipe-content" :style="style" @tap.stop="tapContent"><slot /></view>
  </view>
</template>

<style scoped>
.swipe-cell { position: relative; overflow: hidden; border-radius: var(--eas-radius-panel); margin-bottom: 16rpx; touch-action: pan-y; }
.swipe-content { position: relative; z-index: 1; background: var(--eas-surface); }
.swipe-actions { position: absolute; right: 0; top: 0; bottom: 0; display: flex; }
.swipe-action { flex: 1; display: flex; align-items: center; justify-content: center; min-width: 144rpx; min-height: 88rpx; font-size: 28rpx; color: var(--eas-surface); background: var(--eas-primary); }
.swipe-action.is-pressed { color: var(--eas-ink); }
.swipe-action--danger { background: var(--eas-danger); }
.swipe-action--muted { background: var(--eas-ink-2); }
.swipe-action.is-disabled { opacity: 0.7; }
</style>
