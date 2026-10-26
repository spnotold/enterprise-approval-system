<script setup lang="ts">
// 登录 / 注册共用外壳：插画上悬浮样例单据，表单直接放在风景背景上。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SceneryField from '@/components/SceneryField.vue'
import SlipDemo from '@/components/SlipDemo.vue'
import loginIllustration from '@/assets/illustrations/login.webp'
import {
  AUTH_FORM_WIDTH_DEFAULT,
  AUTH_FORM_WIDTH_MIN,
  clampFormWidth,
  initialFormWidth,
  maxFormWidth,
  stepFormWidth,
  writeFormWidth,
} from '@/components/authSplit'

const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const formWidth = ref(initialFormWidth(viewportWidth.value))
const dragging = ref(false)
let activePointerId: number | null = null
let dragStartX = 0
let dragStartWidth = formWidth.value

const widthValue = computed(() => Math.round(formWidth.value))
const maxAriaWidth = computed(() => Math.max(maxFormWidth(viewportWidth.value), AUTH_FORM_WIDTH_MIN))

function onWindowResize() {
  const previousWidth = viewportWidth.value
  const nextWidth = window.innerWidth
  viewportWidth.value = nextWidth
  if (nextWidth <= 880) {
    dragging.value = false
    activePointerId = null
    return
  }
  // 移动断点下不改桌面偏好；重新回到桌面时从记忆值（无记忆则 540）恢复。
  formWidth.value =
    previousWidth <= 880
      ? initialFormWidth(nextWidth)
      : clampFormWidth(formWidth.value, nextWidth)
}

function onSplitPointerDown(event: PointerEvent) {
  if (event.button !== 0 || activePointerId !== null) return
  dragging.value = true
  activePointerId = event.pointerId
  dragStartX = event.clientX
  dragStartWidth = formWidth.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onSplitPointerMove(event: PointerEvent) {
  if (!dragging.value || event.pointerId !== activePointerId) return
  formWidth.value = clampFormWidth(
    Math.round(dragStartWidth - (event.clientX - dragStartX)),
    viewportWidth.value,
  )
}

function finishPointer(event: PointerEvent, releaseCapture: boolean) {
  if (!dragging.value || event.pointerId !== activePointerId) return
  dragging.value = false
  activePointerId = null
  const handle = event.currentTarget as HTMLElement
  if (releaseCapture && handle.hasPointerCapture(event.pointerId)) {
    handle.releasePointerCapture(event.pointerId)
  }
  writeFormWidth(formWidth.value)
}

function onSplitPointerEnd(event: PointerEvent) {
  finishPointer(event, true)
}

function onSplitLostCapture(event: PointerEvent) {
  finishPointer(event, false)
}

function onSplitDblClick() {
  formWidth.value = clampFormWidth(AUTH_FORM_WIDTH_DEFAULT, viewportWidth.value)
  writeFormWidth(formWidth.value)
}

function onSplitKeydown(event: KeyboardEvent) {
  const next = stepFormWidth(event.key, formWidth.value, viewportWidth.value)
  if (next === null) return
  event.preventDefault()
  formWidth.value = next
  writeFormWidth(formWidth.value)
}

onMounted(() => window.addEventListener('resize', onWindowResize))
onBeforeUnmount(() => window.removeEventListener('resize', onWindowResize))
</script>

<template>
  <div
    class="auth-page"
    :class="{ 'is-dragging': dragging }"
    :style="{ '--auth-form-w': `${widthValue}px` }"
  >
    <SceneryField />
    <aside class="auth-aside">
      <div class="aside-inner">
        <img
          class="auth-illustration"
          :src="loginIllustration"
          alt=""
          width="1536"
          height="1024"
        />
        <SlipDemo />
      </div>
    </aside>

    <main id="auth-form-column" class="auth-main">
      <div class="auth-box">
        <div class="brand-compact">
          <span class="brand-mark inked" aria-hidden="true">审</span>
          <span class="brand-name">企业审批</span>
        </div>
        <slot />
      </div>

      <div
        class="auth-split"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右栏宽度"
        tabindex="0"
        :aria-valuenow="widthValue"
        :aria-valuemin="AUTH_FORM_WIDTH_MIN"
        :aria-valuemax="maxAriaWidth"
        :aria-valuetext="`表单栏宽度 ${widthValue} 像素`"
        aria-controls="auth-form-column"
        :data-dragging="dragging ? '' : undefined"
        @pointerdown="onSplitPointerDown"
        @pointermove="onSplitPointerMove"
        @pointerup="onSplitPointerEnd"
        @pointercancel="onSplitPointerEnd"
        @lostpointercapture="onSplitLostCapture"
        @dblclick="onSplitDblClick"
        @keydown="onSplitKeydown"
      >
        <span class="auth-split-grip" aria-hidden="true" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-page {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--auth-form-w, 540px);
  min-height: 100%;
  transition: grid-template-columns var(--eas-dur) var(--eas-ease);
}
.auth-page.is-dragging {
  transition: none;
  -webkit-user-select: none;
  user-select: none;
}

.auth-aside {
  position: relative;
  z-index: 1;
  min-width: 0;
  padding: 24px 24px 30px;
  container: auth-aside / inline-size;
}
.aside-inner {
  position: sticky;
  top: 24px;
  box-sizing: border-box;
  min-height: 640px;
  height: calc(100vh - 54px);
  padding: 60px 56px;
  border-radius: calc(var(--eas-radius-panel) + 4px);
  background: var(--eas-tab);
  box-shadow: 8px 8px 0 var(--eas-shade);
}
.auth-illustration {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
.aside-inner :deep(.slip-demo) {
  position: relative;
  width: min(480px, 100%);
}
.brand-compact {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.brand-mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background-color: var(--eas-rust);
  box-shadow: var(--eas-offset-mark);
  color: var(--eas-sheet);
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-lg);
  font-weight: 400;
  line-height: 1;
}
.brand-name {
  color: var(--eas-ink);
  font-family: var(--eas-font-display);
  font-size: calc(var(--eas-fs-lg) + 1px);
  font-weight: 600;
  letter-spacing: var(--eas-display-tracking);
}

.auth-main {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: safe center;
  justify-content: center;
  min-width: 0;
  container: auth-main / inline-size;
}
.auth-box {
  box-sizing: border-box;
  width: min(540px, 100%);
  padding: 32px 64px;
}

.auth-split {
  position: absolute;
  z-index: 2;
  top: 0;
  bottom: 0;
  left: -6px;
  width: 12px;
  border: 0;
  outline: none;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}
.auth-split::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: var(--eas-primary);
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity var(--eas-dur-fast) var(--eas-ease);
}
.auth-split:hover::before,
.auth-split:focus-visible::before,
.auth-split[data-dragging]::before {
  opacity: 1;
}
.auth-split:focus-visible {
  outline: 2px solid var(--eas-ink);
  outline-offset: 2px;
}
.auth-split-grip {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 28px;
  border-radius: var(--eas-radius-control);
  background: var(--eas-primary);
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: opacity var(--eas-dur-fast) var(--eas-ease);
}
.auth-split:hover .auth-split-grip,
.auth-split:focus-visible .auth-split-grip,
.auth-split[data-dragging] .auth-split-grip {
  opacity: 1;
}

@container auth-aside (inline-size < 640px) {
  .aside-inner {
    padding: 40px 28px;
  }
}
@container auth-aside (inline-size < 430px) {
  .aside-inner {
    padding: 28px 16px;
  }
}
@container auth-main (inline-size < 500px) {
  .auth-box {
    padding-right: 40px;
    padding-left: 40px;
  }
}
@container auth-main (inline-size < 440px) {
  .auth-box {
    padding: 32px 24px;
  }
}

@media (max-width: 880px) {
  .auth-page {
    grid-template-columns: minmax(0, 1fr);
  }
  .auth-aside,
  .auth-split {
    display: none;
  }
  .auth-main {
    align-items: flex-start;
  }
  .auth-box {
    padding: 32px 20px;
  }
}
</style>
