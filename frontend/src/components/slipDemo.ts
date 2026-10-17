// 登录 / 注册页左侧「流转演示」的四步状态机（纯函数，计时和事件都在组件里）
// ① 部门负责人处理中 ② 部门负责人已同意、财务处理中 ③ 企业负责人处理中 ④ 三格已同意 + 行尾落「已通过」章

export type SlipCellState = 'current' | 'approved' | 'waiting'

export interface SlipCell {
  /** 0 起的格子下标 */
  index: number
  key: string
  name: string
  state: SlipCellState
  /** 格子里显示的状态文字 */
  label: string
}

export interface SlipStep {
  /** 1 起的步号 */
  index: number
  cells: SlipCell[]
  /** 第 ④ 步行尾落「已通过」章 */
  showPassedStamp: boolean
  /** 这一步停留多久（ms） */
  duration: number
}

export const SLIP_CELL_NAMES = ['部门负责人', '财务审批', '企业负责人'] as const

export const SLIP_STATE_TEXT: Record<SlipCellState, string> = {
  current: '处理中',
  approved: '已同意',
  waiting: '待流转',
}

export const SLIP_CELL_STAMP_TEXT = '同意'
export const SLIP_PASSED_STAMP_TEXT = '已通过'
export const SLIP_NOTE = '审批流程'

/** 前三步各停 2400ms，第 ④ 步停 3200ms */
export const SLIP_STEP_DURATION = 2400
export const SLIP_PASSED_STEP_DURATION = 3200

export const SLIP_FINAL_STEP = 4
/** 减弱动效（prefers-reduced-motion）时停在这一步 */
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

/** 第 ④ 步之后回到第 ① 步 */
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

/** 悬停行尾的「已通过」章切到第 ④ 步 */
export function stepIndexForStamp(): number {
  return SLIP_FINAL_STEP
}

export function stepForCell(cellIndex: number): SlipStep {
  return stepAt(stepIndexForCell(cellIndex))
}
