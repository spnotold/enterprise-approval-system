<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { closeSwipeCells, openSwipeCell, swipeGesture, touchPoint, type SwipeTouchEvent } from '@/composables/useSwipeTabs'

export interface SwipeAction { text: string; type?: 'primary' | 'danger' | 'muted'; key: string }
const props = defineProps<{ cellId: string; actions: SwipeAction[] }>()
const emit = defineEmits<{ 'content-tap': []; action: [key: string] }>()
const offset = ref(0)
const dragging = ref(false)
const width = computed(() => uni.upx2px(144) * props.actions.length)
const style = computed(() => ({ transform: `translateX(${offset.value}px)`, transition: dragging.value ? 'none' : 'transform var(--eas-dur) var(--eas-ease)' }))
let start: { x: number; y: number } | undefined
let origin = 0
let direction: 'horizontal' | 'vertical' | undefined
let moved = false
let wasOpen = false

function close(): void { dragging.value = false; offset.value = 0 }
watch(openSwipeCell, (id) => { if (id !== props.cellId) close() })
watch(() => props.actions.length, () => { close(); if (openSwipeCell.value === props.cellId) closeSwipeCells() })
onUnmounted(() => { if (openSwipeCell.value === props.cellId) closeSwipeCells() })
function touchStart(e: SwipeTouchEvent): void {
  start = e.touches.length === 1 ? touchPoint(e) : undefined
  origin = offset.value
  wasOpen = offset.value !== 0
  direction = undefined
  moved = false
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
  if (direction !== 'horizontal' || !width.value || (dx > 0 && !wasOpen)) return
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
function action(key: string): void { closeSwipeCells(); close(); emit('action', key) }
</script>

<template>
  <view class="swipe-cell" @touchstart="touchStart" @touchmove="touchMove" @touchend="touchEnd" @touchcancel="touchCancel">
    <view v-if="actions.length" class="swipe-actions" :style="{ width: `${width}px` }">
      <view v-for="a in actions" :key="a.key" class="swipe-action" :class="`swipe-action--${a.type ?? 'primary'}`" hover-class="is-pressed" hover-stay-time="60" @tap.stop="action(a.key)">{{ a.text }}</view>
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
</style>
