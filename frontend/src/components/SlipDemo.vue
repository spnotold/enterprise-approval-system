<script setup lang="ts">
// 登录 / 注册页左侧的样例单据：自动走完三格签批，并在终态落章。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  SLIP_CELL_STAMP_TEXT,
  SLIP_NOTE,
  SLIP_PASSED_STAMP_TEXT,
  SLIP_STATIC_STEP,
  clampStepIndex,
  frameDuration,
  nextDemoFrame,
  stepAt,
  stepIndexForCell,
  type SlipDemoFrame,
} from '@/components/slipDemo'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function readReducedMotion(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(REDUCED_MOTION_QUERY)
}

const motionQuery = readReducedMotion()
const reducedMotion = ref(!!motionQuery?.matches)
const frame = ref<SlipDemoFrame>({
  stepIndex: reducedMotion.value ? SLIP_STATIC_STEP : 1,
  phase: 'showing',
})
const hovering = ref(false)
const pageHidden = ref(typeof document !== 'undefined' && document.visibilityState === 'hidden')
const stopped = ref(false)

const step = computed(() => stepAt(frame.value.stepIndex))
const resetting = computed(() => frame.value.phase === 'resetting')

let timer: ReturnType<typeof setTimeout> | null = null
let deadline = 0
let remaining = frameDuration(frame.value)

function clearTimer() {
  if (timer === null) return
  clearTimeout(timer)
  timer = null
}

function playing() {
  return !stopped.value && !reducedMotion.value && !hovering.value && !pageHidden.value
}

/** 暂停时保留当前阶段剩余时间，hover 与页面隐藏可相互叠加。 */
function pause() {
  if (timer !== null) remaining = Math.max(0, deadline - Date.now())
  clearTimer()
}

function schedule() {
  clearTimer()
  if (!playing()) return
  const delay = Math.max(0, remaining)
  deadline = Date.now() + delay
  timer = setTimeout(() => {
    timer = null
    frame.value = nextDemoFrame(frame.value)
    remaining = frameDuration(frame.value)
    schedule()
  }, delay)
}

function gotoStep(index: number) {
  frame.value = { stepIndex: clampStepIndex(index), phase: 'showing' }
  remaining = frameDuration(frame.value)
}

function onStageEnter() {
  hovering.value = true
  pause()
}

function onStageLeave() {
  hovering.value = false
  if (reducedMotion.value) {
    gotoStep(SLIP_STATIC_STEP)
    return
  }
  schedule()
}

function onCellEnter(index: number) {
  gotoStep(stepIndexForCell(index))
}

function onMotionChange(event: MediaQueryListEvent) {
  if (event.matches === reducedMotion.value) return
  reducedMotion.value = event.matches
  if (event.matches) {
    pause()
    gotoStep(SLIP_STATIC_STEP)
    return
  }
  remaining = frameDuration(frame.value)
  schedule()
}

function onVisibilityChange() {
  pageHidden.value = document.visibilityState === 'hidden'
  if (pageHidden.value) pause()
  else schedule()
}

onMounted(() => {
  motionQuery?.addEventListener('change', onMotionChange)
  document.addEventListener('visibilitychange', onVisibilityChange)
  schedule()
})

onBeforeUnmount(() => {
  stopped.value = true
  clearTimer()
  motionQuery?.removeEventListener('change', onMotionChange)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="slip-demo">
    <div
      class="specimen-sheet sheet"
      :class="{ 'is-resetting': resetting }"
      aria-hidden="true"
      @mouseenter="onStageEnter"
      @mouseleave="onStageLeave"
    >
      <div class="specimen-head">
        <div class="specimen-copy">
          <div class="specimen-kind">
            <span>采购申请</span>
            <span class="specimen-number">CG20261016000017</span>
          </div>
          <div class="specimen-title">研发部采购测试服务器扩容</div>
          <div class="specimen-meta">
            <span>申请人<b>王工</b></span>
            <span>研发部</span>
          </div>
        </div>
        <div class="specimen-amount">
          <span class="amount-label">金额</span>
          <strong>¥12,800.00</strong>
        </div>
        <span
          v-if="step.showPassedStamp"
          class="passed-stamp stamp-enter"
        >{{ SLIP_PASSED_STAMP_TEXT }}</span>
      </div>

      <div class="signature-part">
        <div class="signature-row">
          <div
            v-for="cell in step.cells"
            :key="cell.key"
            class="signature-cell"
            :class="cell.state"
            @mouseenter="onCellEnter(cell.index)"
          >
            <div class="cell-node">{{ cell.name }}</div>
            <div v-if="cell.state === 'waiting'" class="cell-state">{{ cell.label }}</div>
            <template v-else>
              <div class="cell-person">{{ cell.assignee }}</div>
              <div v-if="cell.state === 'current'" class="cell-state">{{ cell.label }}</div>
              <div v-else class="cell-time">{{ cell.approvedAt }}</div>
              <span
                v-if="cell.state === 'approved'"
                class="cell-stamp stamp-enter"
              >{{ SLIP_CELL_STAMP_TEXT }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
    <p class="slip-caption">{{ SLIP_NOTE }}</p>
  </div>
</template>

<style scoped>
.slip-demo {
  width: min(540px, 100%);
  container: auth-slip / inline-size;
  pointer-events: auto;
}
.specimen-sheet {
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
  width: 100%;
  opacity: 1;
  transition: opacity var(--eas-dur) var(--eas-ease);
}
.specimen-sheet.is-resetting {
  opacity: 0;
}

.specimen-head {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 24px;
  padding: 22px 24px 18px;
}
.specimen-copy {
  min-width: 0;
}
.specimen-kind {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-sm);
}
.specimen-kind > span {
  white-space: nowrap;
  word-break: keep-all;
}
.specimen-number {
  font-variant-numeric: tabular-nums;
}
.specimen-title {
  margin: 2px 0 8px;
  font-family: var(--eas-font-serif);
  font-size: 21px;
  font-weight: 600;
  line-height: 1.35;
}
.specimen-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
  color: var(--eas-ink-2);
}
.specimen-meta b {
  margin-left: 6px;
  color: var(--eas-ink);
  font-weight: 400;
}
.specimen-amount {
  display: flex;
  flex-direction: column;
  align-self: end;
  padding-top: 44px;
  text-align: right;
  white-space: nowrap;
}
.amount-label {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
}
.specimen-amount strong {
  font-family: var(--eas-font-serif);
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.signature-part {
  padding: 16px 24px 20px;
  border-top: 1px solid var(--eas-rule);
}
.signature-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
}
.signature-cell {
  position: relative;
  min-width: 0;
  min-height: 88px;
  box-sizing: border-box;
  padding: 10px 14px 12px;
  border-right: 1px solid var(--eas-rule-strong);
  background: var(--eas-sheet);
  transition:
    background-color var(--eas-dur) var(--eas-ease),
    color var(--eas-dur) var(--eas-ease);
}
.signature-cell:last-child {
  border-right: 0;
}
.signature-cell.current {
  z-index: 1;
  background: var(--eas-primary-tint);
  outline: 1.5px dashed var(--eas-primary);
  outline-offset: -5px;
}
.cell-node {
  padding-right: 48px;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
  line-height: 1.3;
  white-space: nowrap;
}
.current .cell-node {
  color: var(--eas-ink-2);
}
.cell-person {
  margin-top: 6px;
  font-size: var(--eas-fs-nav);
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}
.cell-time {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  white-space: nowrap;
}
.cell-state {
  margin-top: 6px;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-note);
  line-height: 1.3;
}
.current .cell-state {
  color: var(--eas-primary);
}

.cell-stamp,
.passed-stamp {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1.5px solid var(--eas-success);
  color: var(--eas-success);
  font-family: var(--eas-font-serif);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
}
.cell-stamp {
  top: 7px;
  right: 10px;
  padding: 2px 6px;
  border-radius: var(--eas-radius-tag);
  font-size: var(--eas-fs-note);
  letter-spacing: 0.16em;
  text-indent: 0.16em;
  transform: rotate(-6deg);
}
.passed-stamp {
  top: 16px;
  right: 22px;
  padding: 7px 12px;
  border-width: 2px;
  border-radius: var(--eas-radius-panel);
  box-shadow:
    inset 0 0 0 2px var(--eas-sheet),
    inset 0 0 0 3px var(--eas-success);
  font-size: var(--eas-fs-lg);
  letter-spacing: 0.2em;
  text-indent: 0.2em;
  opacity: 0.9;
  transform: rotate(-8deg);
}
.cell-stamp.stamp-enter {
  animation: cell-stamp-in var(--eas-dur-stamp) var(--eas-ease) both;
}
.passed-stamp.stamp-enter {
  animation: passed-stamp-in var(--eas-dur-stamp) var(--eas-ease) both;
}
@keyframes cell-stamp-in {
  from {
    opacity: 0;
    transform: rotate(-6deg) scale(1.15);
  }
  to {
    opacity: 1;
    transform: rotate(-6deg) scale(1);
  }
}
@keyframes passed-stamp-in {
  from {
    opacity: 0;
    transform: rotate(-8deg) scale(1.15);
  }
  to {
    opacity: 0.9;
    transform: rotate(-8deg) scale(1);
  }
}

.slip-caption {
  margin: 12px 0 0;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-xs);
}

/* Query the paper's available width after the aside's own gutters. */
@container auth-slip (inline-size < 520px) {
  .specimen-head {
    position: static;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding: 18px 16px 15px;
  }
  .specimen-kind {
    gap: 2px 8px;
    font-size: var(--eas-fs-xs);
  }
  .specimen-title {
    font-size: var(--eas-fs-lg);
  }
  .specimen-meta {
    gap: 14px;
    font-size: var(--eas-fs-xs);
  }
  .specimen-amount strong {
    font-size: var(--eas-fs-lg);
  }
  .specimen-amount {
    padding-top: 0;
    text-align: left;
  }
  .signature-part {
    /* Keep the final seal's space through every animation step. */
    padding: 14px 16px 68px;
  }
  .signature-cell {
    padding-right: 8px;
    padding-left: 8px;
  }
  .cell-node {
    padding-right: 35px;
  }
  .cell-stamp {
    right: 8px;
    padding: 2px;
    font-size: var(--eas-fs-xs);
    letter-spacing: 0;
    text-indent: 0;
  }
  .passed-stamp {
    top: auto;
    right: 16px;
    bottom: 20px;
    font-size: var(--eas-fs-md);
  }
}

/* Below this width three cells would each have less than 112px. */
@container auth-slip (inline-size < 372px) {
  .specimen-head {
    padding: 14px 12px;
  }
  .specimen-title {
    font-size: var(--eas-fs-md);
  }
  .signature-part {
    padding: 12px 12px 64px;
  }
  .signature-row {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: 1fr;
  }
  .signature-cell {
    border-right: 0;
    border-bottom: 1px solid var(--eas-rule-strong);
  }
  .signature-cell:last-child {
    border-bottom: 0;
  }
  .passed-stamp {
    right: 12px;
    bottom: 18px;
    padding: 6px 9px;
    font-size: var(--eas-fs-sm);
  }
}
</style>
