<script setup lang="ts">
// 页面背景：铺满视口的淡色风景 + 风吹草地 + 飘叶（见 composables/useScenery.ts）。
// WebGL 不可用时只显示容器的 CSS 静态背景。
import { ref } from 'vue'
import { useScenery } from '@/composables/useScenery'
import meadow from '@/assets/illustrations/bg-meadow.webp'
import leaf1 from '@/assets/illustrations/leaf-1.webp'
import leaf2 from '@/assets/illustrations/leaf-2.webp'
import leaf3 from '@/assets/illustrations/leaf-3.webp'
import leaf4 from '@/assets/illustrations/leaf-4.webp'
import leaf5 from '@/assets/illustrations/leaf-5.webp'
import leaf6 from '@/assets/illustrations/leaf-6.webp'

const meadowCanvas = ref<HTMLCanvasElement | null>(null)
const leafCanvas = ref<HTMLCanvasElement | null>(null)
const { live } = useScenery(meadowCanvas, leafCanvas, {
  background: meadow,
  leaves: [leaf1, leaf2, leaf3, leaf4, leaf5, leaf6],
})
</script>

<template>
  <div class="scenery" :style="{ '--scenery-image': `url(${meadow})` }" aria-hidden="true">
    <canvas ref="meadowCanvas" class="scenery-canvas" :class="{ 'is-live': live }" />
    <canvas ref="leafCanvas" class="scenery-canvas is-live" />
  </div>
</template>

<style scoped>
.scenery {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  user-select: none;
  background:
    linear-gradient(color-mix(in srgb, var(--eas-desk) 28%, transparent), color-mix(in srgb, var(--eas-desk) 28%, transparent)),
    var(--scenery-image) center bottom / cover no-repeat,
    var(--eas-desk);
}
.scenery-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
}
.scenery-canvas.is-live {
  opacity: 1;
}
</style>
