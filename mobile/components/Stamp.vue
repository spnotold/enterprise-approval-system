<script setup lang="ts">
// 章：描边方框、状态色、rotate(-6deg)，不填色。
// animate 时 1.15→1 缩放 + 透明度 0→1，240ms，只在挂载时播一次；prefers-reduced-motion 时直接显示。
const props = withDefaults(
  defineProps<{
    text: string
    tone?: 'success' | 'danger' | 'primary' | 'muted'
    /** 挂载时播放盖章动画；之后 prop 再变化也不会重播 */
    animate?: boolean
    /** sm 用于签批格，md 用于单据头终态 */
    size?: 'sm' | 'md'
  }>(),
  { tone: 'success', animate: false, size: 'md' },
)

const play = props.animate
</script>

<template>
  <view class="stamp" :class="[`tone-${tone}`, `size-${size}`, { play }]">
    <text class="stamp-text">{{ text }}</text>
  </view>
</template>

<style scoped>
.stamp {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 6rpx double currentColor;
  border-radius: 18rpx;
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  -webkit-mask-image: var(--eas-stamp-mask);
  mask-image: var(--eas-stamp-mask);
  mask-size: cover;
  transform: rotate(-10deg);
}

.stamp-text {
  font-family: var(--eas-font-serif);
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.size-sm {
  padding: 2rpx 10rpx;
  border-width: 2rpx;
  border-radius: 14rpx;
}

.size-sm .stamp-text {
  font-size: var(--eas-fs-xs);
}

.size-md {
  padding: 6rpx 18rpx;
}

.size-md .stamp-text {
  font-size: var(--eas-fs-md);
  letter-spacing: 4rpx;
}

.tone-success {
  color: var(--eas-success);
}

.tone-danger {
  color: var(--eas-danger);
}

.tone-primary {
  color: var(--eas-primary);
}

/* 撤回章用深一档的灰，纸上才够 4.5:1 */
.tone-muted {
  color: var(--eas-ink-2);
}

/* 小章落在铁锈浅底的驳回格上，用深铁锈保证对比度 */
.size-sm.tone-danger {
  color: var(--eas-rust-deep);
}

.stamp.play {
  animation: stamp-in var(--eas-dur-stamp) var(--eas-ease) both;
}

@keyframes stamp-in {
  from {
    opacity: 0;
    transform: scale(1.15) rotate(-10deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(-10deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .stamp.play {
    animation: none;
  }
}
</style>
