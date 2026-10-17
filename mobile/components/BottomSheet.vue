<script setup lang="ts">
// 底部弹出面板（审批意见、驳回理由、同行人员选择等），底部留出安全区。
// 自下而上滑入；按住顶部拖动条或标题区下拉，面板跟手下移，
// 下拉超过 120rpx 或快速下划时关闭，否则回弹。内容区内的滚动不触发下拉。
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  title?: string
}>()

const emit = defineEmits<{ close: [] }>()

const offset = ref(0) // 面板下移距离（px）
const dragging = ref(false)
const leaving = ref(false)

let startY = 0
let startAt = 0
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    if (timer) clearTimeout(timer)
    timer = null
    offset.value = 0
    dragging.value = false
    leaving.value = false
  },
)

/** 先让面板滑出再通知父组件关闭 */
function close(): void {
  if (leaving.value) return
  leaving.value = true
  dragging.value = false
  timer = setTimeout(() => {
    timer = null
    emit('close')
  }, 200)
}

type TouchLike = { touches?: ArrayLike<{ clientY: number }>; changedTouches?: ArrayLike<{ clientY: number }> }

function clientY(e: TouchLike): number {
  return (e?.touches?.[0] ?? e?.changedTouches?.[0])?.clientY ?? 0
}

function onDragStart(e: TouchLike): void {
  if (leaving.value) return
  startY = clientY(e)
  startAt = Date.now()
  dragging.value = true
}

function onDragMove(e: TouchLike): void {
  if (!dragging.value) return
  offset.value = Math.max(0, clientY(e) - startY)
}

function onDragEnd(): void {
  if (!dragging.value) return
  dragging.value = false
  const dy = offset.value
  const fast = Date.now() - startAt < 250 && dy > uni.upx2px(60)
  if (dy > uni.upx2px(120) || fast) close()
  else offset.value = 0
}
</script>

<template>
  <view v-if="visible" class="sheet-mask" :class="{ leaving }" @tap="close">
    <view
      class="sheet"
      :class="{ dragging, leaving }"
      :style="leaving ? '' : `transform: translateY(${offset}px)`"
      @tap.stop
    >
      <view class="sheet-grab" @touchstart="onDragStart" @touchmove.stop.prevent="onDragMove" @touchend="onDragEnd" @touchcancel="onDragEnd">
        <view class="sheet-handle" />
        <view class="sheet-head">
          <text class="sheet-title">{{ title }}</text>
          <view class="sheet-close" hover-class="is-pressed" :hover-stay-time="60" @tap="close">
            <view class="sheet-close-icon" />
          </view>
        </view>
      </view>
      <scroll-view scroll-y class="sheet-body">
        <slot />
      </scroll-view>
      <view class="sheet-foot">
        <slot name="footer" />
      </view>
    </view>
  </view>
</template>

<style scoped>
.sheet-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 200;
  background: rgba(34, 48, 58, 0.4);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  animation: mask-in var(--eas-dur) var(--eas-ease);
  transition: opacity var(--eas-dur) var(--eas-ease);
}

.sheet-mask.leaving {
  opacity: 0;
}

.sheet {
  background: var(--eas-surface);
  border-radius: var(--eas-radius-panel) var(--eas-radius-panel) 0 0;
  box-shadow: var(--eas-shadow-float);
  padding-bottom: env(safe-area-inset-bottom);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  /* backwards：动画结束后让行内 transform（跟手位移）生效 */
  animation: sheet-in var(--eas-dur) var(--eas-ease) backwards;
  transition: transform var(--eas-dur) var(--eas-ease);
}

.sheet.dragging {
  transition: none;
}

.sheet.leaving {
  transform: translateY(100%);
}

@keyframes sheet-in {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.sheet-grab {
  flex-shrink: 0;
  border-bottom: 1rpx solid var(--eas-rule);
}

.sheet-handle {
  width: 48rpx;
  height: 8rpx;
  margin: 16rpx auto 0;
  border-radius: 4rpx;
  background: var(--eas-rule-strong);
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8rpx 0 32rpx;
}

.sheet-title {
  font-size: var(--eas-fs-md);
  font-weight: 600;
  color: var(--eas-ink);
}

.sheet-close {
  position: relative;
  width: 88rpx;
  height: 88rpx;
  border-radius: var(--eas-radius-control);
}

/* 关闭图标：两条交叉细线 */
.sheet-close-icon::before,
.sheet-close-icon::after {
  content: '';
  position: absolute;
  left: 28rpx;
  top: 43rpx;
  width: 32rpx;
  height: 3rpx;
  background: var(--eas-ink-3);
  transform: rotate(45deg);
}

.sheet-close-icon::after {
  transform: rotate(-45deg);
}

.sheet-body {
  max-height: 60vh;
  padding: 24rpx 32rpx;
  box-sizing: border-box;
}

.sheet-foot {
  padding: 16rpx 32rpx 24rpx;
}
</style>
