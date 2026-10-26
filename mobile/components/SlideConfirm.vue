<script setup lang="ts">
// 滑动同意：把滑块拖到轨道 ≥ 90% 处松手才触发 confirm，中途松手或被系统打断（touchcancel）都回弹；单点滑块提示操作方式。
// H5 另支持鼠标拖动，以及 Tab 聚焦后按两次 Enter / 空格确认；小程序端保持纯触摸滑动。
// 成功时短振动；loading 时不可再拖；提交失败由父组件调用 reset() 复位。手势判定见 utils/slideGesture。
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { initialSlide, reduceSlide, type SlideEvent } from '@/utils/slideGesture'

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
/** 键盘待确认的有效期 */
const ARM_MS = 4000

const state = ref(initialSlide())
const maxLeft = ref(0) // 滑块可移动的最大距离（px）
let armTimer: ReturnType<typeof setTimeout> | undefined

const left = computed(() => state.value.left)
const dragging = computed(() => state.value.phase === 'dragging')
const armed = computed(() => state.value.phase === 'armed')
const confirmed = computed(() => state.value.phase === 'confirmed')

type TouchLike = { touches?: ArrayLike<{ clientX: number; clientY: number }>; changedTouches?: ArrayLike<{ clientX: number; clientY: number }> }
type MouseLike = { clientX: number; clientY: number; button?: number }

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
const hintText = computed(() => (confirmed.value ? props.doneText : armed.value ? '再按一次 Enter 或空格确认' : props.text))
const percent = computed(() => (confirmed.value ? 100 : maxLeft.value > 0 ? Math.round((left.value / maxLeft.value) * 100) : 0))

function vibrate(): void {
  try {
    uni.vibrateShort({ fail: () => {} })
  } catch {
    // H5 不支持振动时静默
  }
}

function clearArm(): void {
  if (armTimer !== undefined) clearTimeout(armTimer)
  armTimer = undefined
}

function dispatch(e: SlideEvent): void {
  const { state: next, effect } = reduceSlide(state.value, e)
  state.value = next
  if (next.phase !== 'armed') clearArm()
  if (effect === 'confirm') {
    vibrate()
    emit('confirm')
  } else if (effect === 'hint') {
    uni.showToast({ title: props.text, icon: 'none' })
  } else if (effect === 'arm') {
    armTimer = setTimeout(() => dispatch({ type: 'disarm' }), ARM_MS)
  }
}

function begin(x: number, y: number): boolean {
  if (locked.value) return false
  if (maxLeft.value <= 0) measure()
  dispatch({ type: 'start', x, y })
  return true
}

function onTouchStart(e: TouchLike): void {
  const p = point(e)
  begin(p.x, p.y)
}

function onTouchMove(e: TouchLike): void {
  const p = point(e)
  dispatch({ type: 'move', x: p.x, y: p.y, maxLeft: maxLeft.value })
}

/** 正常抬起：位置够才确认 */
function onTouchEnd(): void {
  dispatch({ type: 'end', maxLeft: maxLeft.value })
}

/** 来电、系统手势、滚动接管等打断：只回弹，绝不确认 */
function onTouchCancel(): void {
  dispatch({ type: 'cancel' })
}

// #ifdef H5
function onMouseMove(e: MouseEvent): void {
  dispatch({ type: 'move', x: e.clientX, y: e.clientY, maxLeft: maxLeft.value })
}

function onMouseUp(): void {
  unbindMouse()
  dispatch({ type: 'end', maxLeft: maxLeft.value })
}

/** 拖动中窗口失焦（切走、弹窗）收不到 mouseup，按打断处理 */
function onWindowBlur(): void {
  unbindMouse()
  dispatch({ type: 'cancel' })
}

function unbindMouse(): void {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('blur', onWindowBlur)
}

function onMouseDown(e: MouseLike): void {
  if (e.button !== undefined && e.button !== 0) return
  if (!begin(e.clientX, e.clientY)) return
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', onWindowBlur)
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    dispatch({ type: 'disarm' })
    return
  }
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  if (e.repeat || locked.value) return
  if (maxLeft.value <= 0) measure()
  dispatch({ type: 'key', maxLeft: maxLeft.value })
}

onBeforeUnmount(unbindMouse)
// #endif

/** 提交失败等场景由父组件调用，回到未同意状态 */
function reset(): void {
  dispatch({ type: 'reset' })
}

defineExpose({ reset })

onMounted(() => void nextTick(() => measure()))
onBeforeUnmount(clearArm)
</script>

<template>
  <view class="slide" :class="{ 'is-locked': disabled || loading, 'is-done': confirmed, 'is-armed': armed }">
    <view class="slide-track">
      <view class="slide-fill" :class="{ dragging }" :style="{ width: `${left + knobPx}px` }" />
      <text class="slide-hint" :style="{ opacity: hintOpacity }">{{ hintText }}</text>
      <!-- #ifdef H5 -->
      <!-- touchend 阻止默认行为，避免点按后浏览器再补发 mousedown/mouseup 重复触发 -->
      <view
        class="slide-knob"
        :class="{ dragging }"
        :style="{ transform: `translateX(${left}px)` }"
        :tabindex="disabled || loading ? -1 : 0"
        role="slider"
        :aria-label="`${text}，或按两次 Enter / 空格确认`"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="percent"
        :aria-valuetext="hintText"
        :aria-disabled="disabled || loading"
        @touchstart.stop="onTouchStart"
        @touchmove.stop.prevent="onTouchMove"
        @touchend.stop.prevent="onTouchEnd"
        @touchcancel.stop="onTouchCancel"
        @mousedown.stop.prevent="onMouseDown"
        @keydown="onKeyDown"
        @blur="dispatch({ type: 'disarm' })"
      >
        <view :class="confirmed ? 'slide-check' : 'slide-chevron'" />
      </view>
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <view
        class="slide-knob"
        :class="{ dragging }"
        :style="{ transform: `translateX(${left}px)` }"
        @touchstart.stop="onTouchStart"
        @touchmove.stop.prevent="onTouchMove"
        @touchend.stop="onTouchEnd"
        @touchcancel.stop="onTouchCancel"
      >
        <view :class="confirmed ? 'slide-check' : 'slide-chevron'" />
      </view>
      <!-- #endif -->
    </view>
  </view>
</template>

<style scoped>
.slide-track {
  position: relative;
  height: 96rpx;
  min-height: 96rpx;
  background: var(--eas-tab);
  border-radius: var(--eas-radius-pill);
  overflow: hidden;
}

/* 滑块走过的部分 */
.slide-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--eas-sage);
  border-radius: var(--eas-radius-pill);
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
  background-color: var(--eas-primary);
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  border-radius: 50%;
  box-shadow: var(--eas-offset-mark);
  transition: transform var(--eas-dur) var(--eas-ease), background-color var(--eas-dur) var(--eas-ease);
  touch-action: none;
}

/* #ifdef H5 */
.slide-knob:focus-visible {
  outline: 4rpx solid var(--eas-sheet);
  outline-offset: -10rpx;
}
/* #endif */

.slide-knob.dragging,
.slide-fill.dragging {
  transition: none;
}

/* 键盘待确认：提示文字加重，等第二次按键 */
.slide.is-armed .slide-hint {
  color: var(--eas-primary);
  font-weight: 600;
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
  background: var(--eas-sage);
}

.slide.is-done .slide-hint {
  left: 0;
  right: 96rpx;
  color: var(--eas-ink);
  font-weight: 600;
}

.slide.is-locked:not(.is-done) .slide-knob {
  opacity: 0.6;
}
</style>
