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
      <span
        v-if="step.showPassedStamp"
        class="passed-stamp stamp-enter"
      >{{ SLIP_PASSED_STAMP_TEXT }}</span>
    </div>
    <p class="slip-caption">{{ SLIP_NOTE }}</p>
  </div>
</template>

<style scoped>
.slip-demo {
  width: min(480px, 100%);
  container: auth-slip / inline-size;
}
.specimen-sheet {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  box-shadow: 8px 8px 0 var(--eas-shade);
  opacity: 1;
  transition: opacity var(--eas-dur) var(--eas-ease);
}
.specimen-sheet.is-resetting {
  opacity: 0;
}

.specimen-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 4px 16px;
  padding: 20px 22px 14px;
}
.specimen-copy {
  display: contents;
}
.specimen-kind {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-note);
}
.specimen-number {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.specimen-title {
  grid-column: 1 / -1;
  font-family: var(--eas-font-display);
  font-size: calc(var(--eas-fs-lg) + 6px);
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: var(--eas-display-tracking);
}
.specimen-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-note);
}
.specimen-meta b {
  margin-left: 6px;
  color: var(--eas-ink);
  font-weight: 400;
}
.specimen-amount {
  text-align: right;
  white-space: nowrap;
}
.amount-label {
  display: inline-block;
  margin-right: 6px;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
}
.specimen-amount strong {
  font-family: var(--eas-font-display);
  font-size: calc(var(--eas-fs-lg) + 4px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  letter-spacing: var(--eas-display-tracking);
}

.signature-part {
  padding: 0 22px 32px;
}
.signature-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.signature-cell {
  position: relative;
  min-width: 0;
  min-height: 92px;
  box-sizing: border-box;
  padding: 10px 12px 12px;
  border-radius: calc(var(--eas-radius-control) + 2px);
  transition:
    background-color var(--eas-dur) var(--eas-ease),
    box-shadow var(--eas-dur) var(--eas-ease);
}
.signature-cell.current {
  background: var(--eas-mustard-tint);
  box-shadow: var(--eas-offset-mark);
}
.signature-cell.approved {
  background: var(--eas-sage-tint);
}
.signature-cell.waiting {
  background: var(--eas-tab);
  color: var(--eas-ink-3);
}
.cell-node {
  position: relative;
  z-index: 1;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-xs);
  font-weight: 600;
  line-height: 1.3;
}
.waiting .cell-node {
  color: var(--eas-ink-3);
}
.cell-person {
  position: relative;
  z-index: 1;
  margin-top: 8px;
  font-family: var(--eas-font-display);
  font-size: calc(var(--eas-fs-lg) + 1px);
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: var(--eas-display-tracking);
}
.cell-time,
.cell-state {
  position: relative;
  z-index: 1;
  margin-top: 6px;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-xs);
  line-height: 1.3;
}
.cell-time {
  font-variant-numeric: tabular-nums;
}
.waiting .cell-state {
  color: var(--eas-ink-3);
}
.current .cell-state {
  color: var(--eas-ink);
}

.cell-stamp,
.passed-stamp {
  position: absolute;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  border: 2px solid currentColor;
  border-radius: 50%;
  font-family: var(--eas-font-display);
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  -webkit-mask-image: var(--eas-stamp-mask);
  mask-image: var(--eas-stamp-mask);
  mask-size: 100% 100%;
}
.cell-stamp {
  top: 6px;
  right: 6px;
  width: 40px;
  height: 40px;
  color: var(--eas-success);
  font-size: var(--eas-fs-note);
  transform: rotate(-12deg);
}
.passed-stamp {
  z-index: 2;
  right: 24px;
  bottom: -42px;
  width: 84px;
  height: 84px;
  border-width: 3px;
  color: var(--eas-rust);
  font-size: var(--eas-fs-lg);
  letter-spacing: var(--eas-display-tracking);
  transform: rotate(-10deg);
  pointer-events: none;
}
.passed-stamp::before {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1.5px solid currentColor;
  border-radius: inherit;
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
    transform: rotate(-12deg) scale(1.15);
  }
  to {
    opacity: 1;
    transform: rotate(-12deg) scale(1);
  }
}
@keyframes passed-stamp-in {
  from {
    opacity: 0;
    transform: rotate(-10deg) scale(1.15);
  }
  to {
    opacity: 1;
    transform: rotate(-10deg) scale(1);
  }
}

.slip-caption {
  width: fit-content;
  margin: 52px 0 0;
  padding: 2px 8px;
  border-radius: var(--eas-radius-pill);
  background: var(--eas-sheet);
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-note);
}

@container auth-slip (inline-size < 440px) {
  .specimen-head {
    grid-template-columns: minmax(0, 1fr);
    padding: 18px 16px 14px;
  }
  .specimen-title {
    font-size: calc(var(--eas-fs-lg) + 1px);
  }
  .specimen-amount {
    text-align: right;
  }
  .signature-part {
    padding: 0 16px 32px;
  }
  .signature-cell {
    padding-right: 8px;
    padding-left: 8px;
  }
  .cell-stamp {
    top: 6px;
    right: 4px;
    width: 32px;
    height: 32px;
    font-size: var(--eas-fs-xs);
  }
}

@container auth-slip (inline-size < 372px) {
  .specimen-head {
    padding: 14px 12px;
  }
  .specimen-title {
    font-size: var(--eas-fs-lg);
  }
  .signature-part {
    padding: 0 12px 32px;
  }
  .signature-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .signature-cell {
    min-height: 82px;
    padding: 10px 12px;
  }
  .cell-person,
  .cell-time {
    padding-right: 42px;
  }
  .cell-stamp {
    top: 6px;
    right: 8px;
    width: 40px;
    height: 40px;
  }
  .passed-stamp {
    right: 12px;
    bottom: -36px;
    width: 72px;
    height: 72px;
    font-size: var(--eas-fs-md);
  }
}

@container auth-slip (inline-size < 200px) {
  .specimen-kind,
  .specimen-meta {
    font-size: var(--eas-fs-xs);
  }
  .specimen-title,
  .specimen-amount strong {
    font-size: var(--eas-fs-md);
  }
  .cell-person,
  .cell-time {
    padding-right: 0;
  }
  .cell-stamp {
    position: static;
    margin-top: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cell-stamp.stamp-enter,
  .passed-stamp.stamp-enter {
    animation: none;
  }
}
</style>
