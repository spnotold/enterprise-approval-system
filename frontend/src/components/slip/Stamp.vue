<script setup lang="ts">
// 章：描边方框、状态色、倾斜 -8°，不填色。animate 时从 1.15 倍缩到 1、透明度 0→1，只播一次。
// played 表示这次落章已经「用掉」：正常播完、动画被取消、播放中途卸载、或减弱动效下直接显示，都只发一次。
import { onBeforeUnmount, onMounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    tone: 'success' | 'danger'
    text: string
    size?: 'sm' | 'lg'
    animate?: boolean
  }>(),
  { size: 'sm', animate: false },
)
const emit = defineEmits<{ played: [] }>()

let consumed = false
function consume() {
  if (!props.animate || consumed) return
  consumed = true
  emit('played')
}
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

onMounted(() => {
  if (reducedMotion()) consume()
})
watch(
  () => props.animate,
  (on) => {
    if (!on) return
    consumed = false
    if (reducedMotion()) consume()
  },
)
onBeforeUnmount(consume)
</script>

<template>
  <span class="stamp" :class="[tone, size, { animate }]" @animationend="consume" @animationcancel="consume">{{ text }}</span>
</template>

<style scoped>
.stamp {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  box-sizing: border-box;
  border: 2px solid currentColor;
  border-radius: 50%;
  -webkit-mask-image: var(--eas-stamp-mask);
  mask-image: var(--eas-stamp-mask);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  font-family: var(--eas-font-display);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  transform: rotate(-10deg);
  user-select: none;
}
.stamp.success {
  color: var(--eas-success);
}
.stamp.danger {
  color: var(--eas-danger);
}
.stamp.sm {
  width: 44px;
  height: 44px;
  padding: 0;
  font-size: 13px;
  letter-spacing: 0.02em;
}
/* 单据头终态章：双线套印，残缺由基础层的遮罩纹理呈现。 */
.stamp.lg {
  width: 86px;
  height: 86px;
  padding: 8px;
  border-width: 2.5px;
  box-shadow:
    inset 0 0 0 2px var(--eas-sheet),
    inset 0 0 0 3px currentColor;
  font-size: 18px;
  letter-spacing: 0.04em;
}
.stamp.animate {
  animation: stamp-in var(--eas-dur-stamp) var(--eas-ease) both;
}
@media (max-width: 768px) {
  .stamp.lg {
    width: 68px;
    height: 68px;
    padding: 6px;
    font-size: 15px;
  }
}
@keyframes stamp-in {
  from {
    opacity: 0;
    transform: rotate(-10deg) scale(1.15);
  }
  to {
    opacity: 1;
    transform: rotate(-10deg) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .stamp.animate { animation: none; opacity: 1; }
}
</style>
