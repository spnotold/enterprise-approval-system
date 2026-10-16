<script setup lang="ts">
// 滑动同意：把滑块拖到轨道 ≥ 90% 处松手才触发 confirm，中途松手回弹；单点滑块提示操作方式。
// 成功时短振动；loading 时不可再拖；提交失败由父组件调用 reset() 复位。
import { computed, getCurrentInstance, nextTick, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    /** 提交中：滑块停在末端，不可再拖 */
    loading?: boolean
    text?: string
    doneText?: string
  }>(),
  { disabled: false, loading: false, text: '向右滑动以同意', doneText: '已同意' },
)

const emit = defineEmits<{ confirm: [] }>()

const instance = getCurrentInstance()
const knobPx = uni.upx2px(96)

const left = ref(0) // 滑块位移（px）
const maxLeft = ref(0) // 滑块可移动的最大距离（px）
const dragging = ref(false)
const confirmed = ref(false)

let startX = 0
let startY = 0
let moved = false

type TouchLike = { touches?: ArrayLike<{ clientX: number; clientY: number }>; changedTouches?: ArrayLike<{ clientX: number; clientY: number }> }

function point(e: TouchLike): { x: number; y: number } {
  const t = e?.touches?.[0] ?? e?.changedTouches?.[0]
  return { x: t?.clientX ?? 0, y: t?.clientY ?? 0 }
}

/** 轨道宽度只能异步取到；面板刚弹出时可能还没布局完成，稍后重试 */
function measure(retries = 0): void {
  if (!instance) return
  uni
    .createSelectorQuery()
    .in(instance.proxy)
    .select('.slide-track')
    .boundingClientRect((track) => {
      const w = (track as UniApp.NodeInfo | null)?.width ?? 0
      if (w > 0) maxLeft.value = Math.max(0, w - knobPx)
      else if (retries < 5) setTimeout(() => measure(retries + 1), 60)
    })
    .exec()
}

const locked = computed(() => props.disabled || props.loading || confirmed.value)
/** 拖动时轨道文字随进度淡出 */
const hintOpacity = computed(() => (confirmed.value || maxLeft.value <= 0 ? 1 : Math.max(0, 1 - (left.value / maxLeft.value) * 1.6)))

function onStart(e: TouchLike): void {
  if (locked.value) return
  if (maxLeft.value <= 0) measure()
  const p = point(e)
  startX = p.x
  startY = p.y
  moved = false
  dragging.value = true
}

function onMove(e: TouchLike): void {
  if (!dragging.value) return
  const p = point(e)
  const dx = p.x - startX
  if (Math.abs(dx) > 4 || Math.abs(p.y - startY) > 4) moved = true
  left.value = Math.max(0, Math.min(maxLeft.value, dx))
}

function vibrate(): void {
  try {
    uni.vibrateShort({ fail: () => {} })
  } catch {
    // H5 不支持振动时静默
  }
}

function onEnd(): void {
  if (!dragging.value) return
  dragging.value = false
  if (moved && maxLeft.value > 0 && left.value >= maxLeft.value * 0.9) {
    confirmed.value = true
    left.value = maxLeft.value
    vibrate()
    emit('confirm')
    return
  }
  left.value = 0
  if (!moved) uni.showToast({ title: props.text, icon: 'none' })
}

/** 提交失败等场景由父组件调用，回到未同意状态 */
function reset(): void {
  confirmed.value = false
  dragging.value = false
  left.value = 0
}

defineExpose({ reset })

onMounted(() => void nextTick(() => measure()))
</script>

<template>
  <view class="slide" :class="{ 'is-locked': disabled || loading, 'is-done': confirmed }">
    <view class="slide-track">
      <view class="slide-fill" :class="{ dragging }" :style="{ width: `${left + knobPx}px` }" />
      <text class="slide-hint" :style="{ opacity: hintOpacity }">{{ confirmed ? doneText : text }}</text>
      <view
        class="slide-knob"
        :class="{ dragging }"
        :style="{ transform: `translateX(${left}px)` }"
        @touchstart.stop="onStart"
        @touchmove.stop.prevent="onMove"
        @touchend.stop="onEnd"
        @touchcancel.stop="onEnd"
      >
        <view :class="confirmed ? 'slide-check' : 'slide-chevron'" />
      </view>
    </view>
  </view>
</template>

<style scoped>
.slide-track {
  position: relative;
  height: 96rpx;
  background: var(--eas-paper-deep);
  border-radius: var(--eas-radius-control);
  overflow: hidden;
}

/* 滑块走过的部分 */
.slide-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--eas-primary-tint);
  border-radius: var(--eas-radius-control);
  transition: width var(--eas-dur) var(--eas-ease);
}

.slide-hint {
  position: absolute;
  left: 96rpx;
  right: 0;
  top: 0;
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
  pointer-events: none;
}

.slide-knob {
  position: absolute;
  left: 0;
  top: 0;
  width: 96rpx;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--eas-primary);
  border-radius: var(--eas-radius-control);
  transition: transform var(--eas-dur) var(--eas-ease), background-color var(--eas-dur) var(--eas-ease);
  touch-action: none;
}

.slide-knob.dragging,
.slide-fill.dragging {
  transition: none;
}

/* 线性图标：右向箭头与对勾，用描边画，颜色跟随 token */
.slide-chevron {
  width: 20rpx;
  height: 20rpx;
  margin-left: -8rpx;
  border-top: 4rpx solid var(--eas-surface);
  border-right: 4rpx solid var(--eas-surface);
  transform: rotate(45deg);
}

.slide-check {
  width: 14rpx;
  height: 26rpx;
  margin-top: -6rpx;
  border-bottom: 4rpx solid var(--eas-surface);
  border-right: 4rpx solid var(--eas-surface);
  transform: rotate(45deg);
}

.slide.is-done .slide-knob {
  background: var(--eas-success);
}

.slide.is-done .slide-fill {
  background: var(--eas-success-tint);
}

.slide.is-done .slide-hint {
  left: 0;
  right: 96rpx;
  color: var(--eas-success);
  font-weight: 600;
}

.slide.is-locked:not(.is-done) .slide-knob {
  opacity: 0.6;
}
</style>
