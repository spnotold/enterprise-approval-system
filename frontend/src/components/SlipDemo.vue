<script setup lang="ts">
// 登录 / 注册页左半边的流转演示：三格签批示意自动循环四步，鼠标进来暂停、移到某格立刻切到那一步。
// 步骤状态、时长、悬停映射都在 slipDemo.ts 里，这里只负责计时、渲染和事件。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Stamp from '@/components/slip/Stamp.vue'
import {
  SLIP_CELL_STAMP_TEXT,
  SLIP_NOTE,
  SLIP_PASSED_STAMP_TEXT,
  SLIP_STATIC_STEP,
  clampStepIndex,
  nextStepIndex,
  stepAt,
  stepIndexForCell,
  stepIndexForStamp,
} from '@/components/slipDemo'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function readReducedMotion(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(REDUCED_MOTION_QUERY)
}

const motionQuery = readReducedMotion()
const reducedMotion = ref(!!motionQuery?.matches)
const stepIndex = ref(reducedMotion.value ? SLIP_STATIC_STEP : 1)
/** 指针在示意图上：暂停计时 */
const hovering = ref(false)
/** 标签页不可见：暂停计时 */
const pageHidden = ref(typeof document !== 'undefined' && document.visibilityState === 'hidden')
const stopped = ref(false)

const step = computed(() => stepAt(stepIndex.value))

/** 每格单独记一次「同意」章的出场次数，重新变成已同意时重新盖章 */
const stampTurn = ref<Record<string, number>>({})
const wasApproved = new Map<string, boolean>()
watch(
  () => step.value,
  (now) => {
    const next = { ...stampTurn.value }
    for (const cell of now.cells) {
      const approved = cell.state === 'approved'
      if (approved && !wasApproved.get(cell.key)) next[cell.key] = (next[cell.key] ?? 0) + 1
      wasApproved.set(cell.key, approved)
    }
    stampTurn.value = next
  },
  { immediate: true },
)

let timer: ReturnType<typeof setTimeout> | null = null

function clearTimer() {
  if (timer === null) return
  clearTimeout(timer)
  timer = null
}

function playing() {
  return !stopped.value && !reducedMotion.value && !hovering.value && !pageHidden.value
}

/** 从当前步开始重新计时 */
function schedule() {
  clearTimer()
  if (!playing()) return
  timer = setTimeout(() => {
    stepIndex.value = nextStepIndex(stepIndex.value)
    schedule()
  }, step.value.duration)
}

function gotoStep(index: number) {
  stepIndex.value = clampStepIndex(index)
}

function onStageEnter() {
  hovering.value = true
  clearTimer()
}

/** 移开后从当前步重新开始计时 */
function onStageLeave() {
  hovering.value = false
  schedule()
}

function onCellEnter(index: number) {
  gotoStep(stepIndexForCell(index))
}

function onPassedStampEnter() {
  gotoStep(stepIndexForStamp())
}

function onMotionChange(event: MediaQueryListEvent) {
  const reduced = event.matches
  if (reduced === reducedMotion.value) return
  reducedMotion.value = reduced
  if (reduced) {
    gotoStep(SLIP_STATIC_STEP)
    clearTimer()
    return
  }
  schedule()
}

function onVisibilityChange() {
  pageHidden.value = document.visibilityState === 'hidden'
  if (pageHidden.value) {
    clearTimer()
    return
  }
  schedule()
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
    <div class="slip-stage" aria-hidden="true" @mouseenter="onStageEnter" @mouseleave="onStageLeave">
      <ol class="slip">
        <li
          v-for="cell in step.cells"
          :key="cell.key"
          class="cell"
          :class="cell.state"
          @mouseenter="onCellEnter(cell.index)"
        >
          <span class="cell-name">{{ cell.name }}</span>
          <span class="cell-state">{{ cell.label }}</span>
          <Stamp
            v-if="cell.state === 'approved'"
            :key="`${cell.key}-${stampTurn[cell.key] ?? 0}`"
            class="cell-stamp"
            tone="success"
            :text="SLIP_CELL_STAMP_TEXT"
            animate
          />
        </li>
      </ol>
      <Stamp
        v-if="step.showPassedStamp"
        :key="`passed-${stepIndex}`"
        class="slip-stamp"
        tone="success"
        :text="SLIP_PASSED_STAMP_TEXT"
        animate
        @mouseenter="onPassedStampEnter"
      />
    </div>
    <p class="slip-note">{{ SLIP_NOTE }}</p>
  </div>
</template>

<style scoped>
.slip-demo {
  margin-top: 32px;
}
.slip-stage {
  position: relative;
}

/* 签批格示意：已办实线落章、当前虚线、未到留空 */
.slip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: var(--eas-surface);
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-tag);
  transition:
    border-color var(--eas-dur) var(--eas-ease),
    background-color var(--eas-dur) var(--eas-ease);
}
.cell.current {
  background: var(--eas-primary-tint);
  border: 1px dashed var(--eas-primary);
}
.cell-name {
  font-size: var(--eas-fs-sm);
  font-weight: 500;
}
.cell-state {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}
.cell.current .cell-state {
  color: var(--eas-primary);
}
.cell.waiting .cell-state {
  color: var(--eas-ink-3);
}
/* 章盖在格子右侧，不占文档流，格子高度不随步骤变化 */
.cell-stamp {
  position: absolute;
  top: 50%;
  right: 10px;
  margin-top: -11px;
}

/* 行尾的「已通过」章：宋体、倾斜，落在这一行下方右侧，与说明文字同一行 */
.slip-stamp {
  position: absolute;
  right: 0;
  bottom: -38px;
  z-index: 1;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-sm);
  letter-spacing: 0.2em;
  text-indent: 0.2em;
}

.slip-note {
  margin: 14px 0 0;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-xs);
}

/* 左栏变窄时竖排：容器是 AuthShell 里的 .auth-aside（跨组件匹配祖先容器） */
/* 360–599：单列、最大宽度 320px；「已通过」章仍在最后一格下方右侧，
   给说明文字让出空间，避免压住它 */
@container auth-aside (360px <= inline-size < 600px) {
  .slip {
    grid-template-columns: minmax(0, 1fr);
    max-width: 320px;
  }
  .slip-note {
    margin-top: 48px;
  }
}
/* < 360：再收紧——格子内边距 8px 10px，「同意」章缩小（选择器带三层，盖过 Stamp.vue 的 .stamp.sm） */
@container auth-aside (inline-size < 360px) {
  .slip {
    grid-template-columns: minmax(0, 1fr);
    max-width: 320px;
  }
  .cell {
    padding: 8px 10px;
  }
  .slip .cell .cell-stamp {
    padding: 1px 3px;
    margin-top: -9px;
  }
  .slip-note {
    margin-top: 48px;
  }
}
</style>
