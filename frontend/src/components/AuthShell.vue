<script setup lang="ts">
// 登录 / 注册共用外壳：左侧是安静的说明区（用一排签批格示意流转，窄屏隐藏），右侧是白底表单
// 两栏之间的分界线可拖动，也可聚焦后用键盘调整；宽度记忆在 localStorage（数值规则见 authSplit.ts）
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PaperField from '@/components/PaperField.vue'
import SlipDemo from '@/components/SlipDemo.vue'
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
/** 表单栏宽度（px），由 CSS 变量 --auth-form-w 驱动 grid */
const formWidth = ref(initialFormWidth(viewportWidth.value))
const dragging = ref(false)

const widthValue = computed(() => Math.round(formWidth.value))
/** 手柄 aria-valuemax：视口太窄时不低于最小值，保证 min ≤ now ≤ max */
const maxAriaWidth = computed(() => Math.max(maxFormWidth(viewportWidth.value), AUTH_FORM_WIDTH_MIN))

function onWindowResize() {
  viewportWidth.value = window.innerWidth
  formWidth.value = clampFormWidth(formWidth.value, viewportWidth.value)
}

function onSplitPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onSplitPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  // 右侧表单栏宽度 = 视口宽度 − 指针 x，再按视口夹紧
  formWidth.value = clampFormWidth(
    Math.round(viewportWidth.value - event.clientX),
    viewportWidth.value,
  )
}

function onSplitPointerEnd(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
  writeFormWidth(formWidth.value)
}

/** 双击复位到 540（带 grid 过渡）并写入记忆 */
function onSplitDblClick() {
  formWidth.value = clampFormWidth(AUTH_FORM_WIDTH_DEFAULT, viewportWidth.value)
  writeFormWidth(formWidth.value)
}

/** 方向键 / Home / End 调整宽度并写入记忆 */
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
    <aside class="auth-aside">
      <PaperField class="auth-paper" base="deep" />
      <div class="aside-inner">
        <span class="logo" aria-hidden="true">审</span>
        <p class="aside-title">企业审批系统</p>
        <SlipDemo />
      </div>
    </aside>

    <main class="auth-main">
      <div
        class="auth-split"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右栏宽度"
        tabindex="0"
        :aria-valuenow="widthValue"
        :aria-valuemin="AUTH_FORM_WIDTH_MIN"
        :aria-valuemax="maxAriaWidth"
        :data-dragging="dragging ? '' : undefined"
        @pointerdown="onSplitPointerDown"
        @pointermove="onSplitPointerMove"
        @pointerup="onSplitPointerEnd"
        @pointercancel="onSplitPointerEnd"
        @dblclick="onSplitDblClick"
        @keydown="onSplitKeydown"
      >
        <span class="auth-split-grip" aria-hidden="true" />
      </div>

      <div class="auth-box">
        <div class="brand-compact">
          <span class="logo" aria-hidden="true">审</span>
          <span class="brand-name">企业审批系统</span>
        </div>
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--auth-form-w, 540px);
  min-height: 100%;
  background: var(--eas-surface);
  transition: grid-template-columns var(--eas-dur) var(--eas-ease);
}
/* 拖动中不加过渡、禁止选中文字 */
.auth-page.is-dragging {
  transition: none;
  -webkit-user-select: none;
  user-select: none;
}
.auth-aside {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: var(--eas-paper-deep);
}
.auth-paper {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}
.aside-inner {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
}
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  border: 1.5px solid var(--eas-primary);
  border-radius: 3px;
  color: var(--eas-primary);
  font-family: var(--eas-font-serif);
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
}
.aside-title {
  margin: 20px 0 0;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-xl);
  font-weight: 600;
  line-height: 1.3;
}

.auth-main {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 40px;
  box-sizing: border-box;
}
/* 分界线手柄：骑在两栏交界处，平时只是一条 1px rule 线，悬停 / 拖动 / 聚焦时加粗并露出握把 */
.auth-split {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -6px;
  width: 12px;
  z-index: 2;
  cursor: col-resize;
  touch-action: none;
  outline: none;
  background: transparent;
  -webkit-user-select: none;
  user-select: none;
}
.auth-split::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: var(--eas-rule);
  transition:
    width var(--eas-dur-fast) var(--eas-ease),
    background-color var(--eas-dur-fast) var(--eas-ease);
}
.auth-split:hover::before,
.auth-split:focus-visible::before,
.auth-split[data-dragging]::before {
  width: 2px;
  background: var(--eas-primary);
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
  transform: translate(-50%, -50%);
  transition: opacity var(--eas-dur-fast) var(--eas-ease);
  pointer-events: none;
}
.auth-split:hover .auth-split-grip,
.auth-split:focus-visible .auth-split-grip,
.auth-split[data-dragging] .auth-split-grip {
  opacity: 1;
}

.auth-box {
  width: 100%;
  max-width: 400px;
}
.brand-compact {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}
.brand-compact .logo {
  width: 28px;
  height: 28px;
  font-size: var(--eas-fs-md);
}
.brand-name {
  font-size: var(--eas-fs-md);
  font-weight: 600;
}

@media (max-width: 880px) {
  .auth-page {
    grid-template-columns: minmax(0, 1fr);
  }
  .auth-aside {
    display: none;
  }
  .auth-main {
    align-items: flex-start;
    padding: 32px 20px;
  }
  .brand-compact {
    display: flex;
  }
  .auth-split {
    display: none;
  }
}
</style>
