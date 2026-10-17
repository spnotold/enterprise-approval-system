import { ref, type Ref } from 'vue'

export interface TouchPoint { clientX?: number; clientY?: number; pageX?: number; pageY?: number }
export interface SwipeTouchEvent { touches: ArrayLike<TouchPoint>; changedTouches?: ArrayLike<TouchPoint> }
export function touchPoint(e: SwipeTouchEvent): { x: number; y: number } | undefined {
  const p = e.touches[0] ?? e.changedTouches?.[0]
  return p ? { x: p.clientX ?? p.pageX ?? 0, y: p.clientY ?? p.pageY ?? 0 } : undefined
}

// A child cell claims the current touch before its move bubbles to the tab area.
// Shared state avoids DOM event mutation and works with WeChat's event payloads.
export const swipeGesture = { consumed: false }
export const openSwipeCell = ref<string | null>(null)
export function closeSwipeCells(): void { openSwipeCell.value = null }

export function useSwipeTabs(index: Ref<number>, count: () => number, select: (index: number) => void) {
  let start: { x: number; y: number } | undefined
  let horizontal: boolean | undefined
  let dx = 0
  let dy = 0
  const suppressTap = ref(false)
  function onTouchStart(e: SwipeTouchEvent): void {
    start = e.touches.length === 1 ? touchPoint(e) : undefined
    horizontal = undefined
    dx = dy = 0
    swipeGesture.consumed = false
    suppressTap.value = false
  }
  function onTouchMove(e: SwipeTouchEvent): void {
    const p = touchPoint(e)
    if (e.touches.length !== 1) { onTouchCancel(); return }
    if (!start || !p) return
    dx = p.x - start.x
    dy = p.y - start.y
    if (horizontal === undefined && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      horizontal = Math.abs(dx) > Math.abs(dy)
    }
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 8) suppressTap.value = true
  }
  function onTouchEnd(): void {
    if (start && horizontal && !swipeGesture.consumed && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const next = Math.max(0, Math.min(count() - 1, index.value + (dx < 0 ? 1 : -1)))
      if (next !== index.value) { closeSwipeCells(); select(next) }
    }
    start = undefined
  }
  function onTouchCancel(): void { start = undefined; suppressTap.value = true }
  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, suppressTap }
}
