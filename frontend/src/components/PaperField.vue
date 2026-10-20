<script setup lang="ts">
import { ref, toRef } from 'vue'
import { usePaperField } from '@/composables/usePaperField'

const props = withDefaults(
  defineProps<{
    base?: string
    radius?: number
    spacing?: number
    dotRadius?: number
    container?: HTMLElement | (() => HTMLElement | null) | null
  }>(),
  {
    base: '--eas-desk',
    radius: 140,
    spacing: 20,
    dotRadius: 1,
    container: null,
  },
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
const baseRef = toRef(props, 'base')

const { isDegraded } = usePaperField(canvasRef, {
  base: baseRef,
  radius: props.radius,
  spacing: props.spacing,
  dotRadius: props.dotRadius,
  container: () => (typeof props.container === 'function' ? props.container() : props.container),
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="paper-field"
    :data-degraded="isDegraded ? '' : undefined"
    aria-hidden="true"
  />
</template>

<style scoped>
.paper-field {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
}
</style>
