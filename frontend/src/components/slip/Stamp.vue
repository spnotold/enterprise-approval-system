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
  border: 1.5px solid currentColor;
  border-radius: var(--eas-radius-tag);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  transform: rotate(-8deg);
  user-select: none;
}
.stamp.success {
  color: var(--eas-success);
}
.stamp.danger {
  color: var(--eas-danger);
}
.stamp.sm {
  padding: 3px 6px;
  font-size: var(--eas-fs-xs);
  letter-spacing: 0.08em;
}
/* 单据头的终态章：双线描边，像一枚真正的印 */
.stamp.lg {
  padding: 8px 14px;
  border-width: 2px;
  box-shadow:
    inset 0 0 0 2px var(--eas-sheet),
    inset 0 0 0 3px currentColor;
  font-size: var(--eas-fs-md);
  letter-spacing: 0.2em;
  text-indent: 0.2em;
}
.stamp.animate {
  animation: stamp-in var(--eas-dur-stamp) var(--eas-ease) both;
}
@keyframes stamp-in {
  from {
    opacity: 0;
    transform: rotate(-8deg) scale(1.15);
  }
  to {
    opacity: 1;
    transform: rotate(-8deg) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .stamp.animate { animation: none; opacity: 1; }
}
</style>
