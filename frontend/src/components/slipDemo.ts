// 登录 / 注册页样例单据的四步状态机（纯函数，计时和 DOM 事件在 SlipDemo.vue）

export type SlipCellState = 'current' | 'approved' | 'waiting'
export type SlipDemoPhase = 'showing' | 'resetting'

export interface SlipCell {
  /** 0 起的格子下标 */
  index: number
  key: string
  name: string
  assignee: string
  approvedAt: string
  state: SlipCellState
  /** 格子里显示的状态文字 */
  label: string
}

export interface SlipStep {
  /** 1 起的步号 */
  index: number
  cells: SlipCell[]
  /** 第 ④ 步在单据头落「已通过」章 */
  showPassedStamp: boolean
  /** 这一步停留多久（ms） */
  duration: number
}

export interface SlipDemoFrame {
  stepIndex: number
  phase: SlipDemoPhase
}

export const SLIP_CELL_NAMES = ['部门负责人', '财务审批', '企业负责人'] as const
export const SLIP_CELL_ASSIGNEES = ['李研', '吴审', '赵总'] as const
export const SLIP_CELL_TIMES = ['10-16 15:02', '10-18 10:26', '10-20 14:36'] as const

export const SLIP_STATE_TEXT: Record<SlipCellState, string> = {
  current: '处理中',
  approved: '同意',
  waiting: '未到',
}

export const SLIP_CELL_STAMP_TEXT = '同意'
export const SLIP_PASSED_STAMP_TEXT = '已通过'
export const SLIP_NOTE = '审批流程'

/** 前三步各停 2400ms，第 ④ 步停 3200ms */
export const SLIP_STEP_DURATION = 2400
export const SLIP_PASSED_STEP_DURATION = 3200
/** 终态淡出后换回第一步；时长与全站常规动效一致 */
export const SLIP_RESET_FADE_DURATION = 200

export const SLIP_FINAL_STEP = 4
/** 减弱动效时默认停在第 ② 步；悬停格子仍可临时切换 */
export const SLIP_STATIC_STEP = 2

const STEP_CELL_STATES: SlipCellState[][] = [
  ['current', 'waiting', 'waiting'],
  ['approved', 'current', 'waiting'],
  ['approved', 'approved', 'current'],
  ['approved', 'approved', 'approved'],
]

function buildStep(index: number): SlipStep {
  const states = STEP_CELL_STATES[index - 1]
  const cells = states.map((state, i) => ({
    index: i,
    key: SLIP_CELL_NAMES[i],
    name: SLIP_CELL_NAMES[i],
    assignee: SLIP_CELL_ASSIGNEES[i],
    approvedAt: SLIP_CELL_TIMES[i],
    state,
    label: SLIP_STATE_TEXT[state],
  }))
  const isFinal = index === SLIP_FINAL_STEP
  return {
    index,
    cells,
    showPassedStamp: isFinal,
    duration: isFinal ? SLIP_PASSED_STEP_DURATION : SLIP_STEP_DURATION,
  }
}

export const SLIP_STEPS: readonly SlipStep[] = STEP_CELL_STATES.map((_, i) => buildStep(i + 1))

export function clampStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 1
  const n = Math.trunc(index)
  if (n < 1) return 1
  return n > SLIP_FINAL_STEP ? SLIP_FINAL_STEP : n
}

export function stepAt(index: number): SlipStep {
  return SLIP_STEPS[clampStepIndex(index) - 1]
}

/** 第 ④ 步显示完毕后先淡出，淡出结束再回到第 ① 步 */
export function nextDemoFrame(frame: SlipDemoFrame): SlipDemoFrame {
  const stepIndex = clampStepIndex(frame.stepIndex)
  if (frame.phase === 'resetting') return { stepIndex: 1, phase: 'showing' }
  if (stepIndex === SLIP_FINAL_STEP) return { stepIndex, phase: 'resetting' }
  return { stepIndex: stepIndex + 1, phase: 'showing' }
}

/** 当前展示阶段到下一次变化的时间 */
export function frameDuration(frame: SlipDemoFrame): number {
  return frame.phase === 'resetting'
    ? SLIP_RESET_FADE_DURATION
    : stepAt(frame.stepIndex).duration
}

/** 保留给其他调用方：第 ④ 步之后回到第 ① 步 */
export function nextStepIndex(index: number): number {
  const n = clampStepIndex(index)
  return n >= SLIP_FINAL_STEP ? 1 : n + 1
}

/** 悬停第 i 格（0 起）切到「第 i 格处理中」那一步 */
export function stepIndexForCell(cellIndex: number): number {
  if (!Number.isFinite(cellIndex)) return 1
  const n = Math.trunc(cellIndex)
  const i = Math.min(Math.max(n, 0), SLIP_CELL_NAMES.length - 1)
  return i + 1
}

export function stepForCell(cellIndex: number): SlipStep {
  return stepAt(stepIndexForCell(cellIndex))
}
