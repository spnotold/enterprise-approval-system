import { describe, expect, it } from 'vitest'
import {
  SLIP_CELL_ASSIGNEES,
  SLIP_CELL_NAMES,
  SLIP_CELL_TIMES,
  SLIP_FINAL_STEP,
  SLIP_NOTE,
  SLIP_PASSED_STAMP_TEXT,
  SLIP_PASSED_STEP_DURATION,
  SLIP_RESET_FADE_DURATION,
  SLIP_STATE_TEXT,
  SLIP_STATIC_STEP,
  SLIP_STEPS,
  SLIP_STEP_DURATION,
  clampStepIndex,
  frameDuration,
  nextDemoFrame,
  nextStepIndex,
  stepAt,
  stepForCell,
  stepIndexForCell,
  type SlipDemoFrame,
} from './slipDemo'

const states = (index: number) => stepAt(index).cells.map((cell) => cell.state)

describe('slip demo steps', () => {
  it('walks the three cells through four steps', () => {
    expect(states(1)).toEqual(['current', 'waiting', 'waiting'])
    expect(states(2)).toEqual(['approved', 'current', 'waiting'])
    expect(states(3)).toEqual(['approved', 'approved', 'current'])
    expect(states(4)).toEqual(['approved', 'approved', 'approved'])
  })

  it('carries the approval-chain specimen data and exact state copy', () => {
    expect(stepAt(1).cells.map((cell) => cell.name)).toEqual([...SLIP_CELL_NAMES])
    expect(SLIP_CELL_NAMES).toEqual(['部门负责人', '财务审批', '企业负责人'])
    expect(SLIP_CELL_ASSIGNEES).toEqual(['李研', '吴审', '赵总'])
    expect(SLIP_CELL_TIMES).toEqual(['10-16 15:02', '10-18 10:26', '10-20 14:36'])
    expect(SLIP_STATE_TEXT).toEqual({ current: '处理中', approved: '同意', waiting: '未到' })
    expect(stepAt(2).cells.map((cell) => cell.label)).toEqual(['同意', '处理中', '未到'])
    expect(stepAt(3).cells.map((cell) => cell.index)).toEqual([0, 1, 2])
  })

  it('carries the readable caption', () => {
    expect(SLIP_NOTE).toBe('审批流程')
  })

  it('drops the passed stamp only on the final step', () => {
    expect(SLIP_STEPS.slice(0, 3).every((step) => !step.showPassedStamp)).toBe(true)
    expect(stepAt(4).showPassedStamp).toBe(true)
    expect(SLIP_PASSED_STAMP_TEXT).toBe('已通过')
    expect(SLIP_FINAL_STEP).toBe(4)
  })

  it('holds the first three steps for 2400ms and the final step for 3200ms', () => {
    expect(SLIP_STEP_DURATION).toBe(2400)
    expect(SLIP_PASSED_STEP_DURATION).toBe(3200)
    expect(SLIP_STEPS.map((step) => step.duration)).toEqual([2400, 2400, 2400, 3200])
  })

  it('fades the final frame before returning to step one', () => {
    const showingFinal: SlipDemoFrame = { stepIndex: 4, phase: 'showing' }
    const fading = nextDemoFrame(showingFinal)
    expect(fading).toEqual({ stepIndex: 4, phase: 'resetting' })
    expect(frameDuration(fading)).toBe(SLIP_RESET_FADE_DURATION)
    expect(nextDemoFrame(fading)).toEqual({ stepIndex: 1, phase: 'showing' })
  })

  it('advances ordinary frames and reports their duration', () => {
    const first: SlipDemoFrame = { stepIndex: 1, phase: 'showing' }
    expect(frameDuration(first)).toBe(2400)
    expect(nextDemoFrame(first)).toEqual({ stepIndex: 2, phase: 'showing' })
    expect(nextStepIndex(1)).toBe(2)
    expect(nextStepIndex(4)).toBe(1)
  })

  it('clamps out-of-range and invalid steps', () => {
    expect(clampStepIndex(0)).toBe(1)
    expect(clampStepIndex(-3)).toBe(1)
    expect(clampStepIndex(9)).toBe(4)
    expect(clampStepIndex(Number.NaN)).toBe(1)
    expect(stepAt(99).index).toBe(4)
  })

  it('maps a hovered cell to the step where that cell is processing', () => {
    expect(stepIndexForCell(0)).toBe(1)
    expect(stepIndexForCell(1)).toBe(2)
    expect(stepIndexForCell(2)).toBe(3)
    expect(stepIndexForCell(9)).toBe(3)
    expect(stepIndexForCell(-1)).toBe(1)
    expect(stepForCell(0).cells.map((cell) => cell.state)).toEqual(['current', 'waiting', 'waiting'])
    expect(stepForCell(1).cells.map((cell) => cell.state)).toEqual(['approved', 'current', 'waiting'])
    expect(stepForCell(2).cells.map((cell) => cell.state)).toEqual(['approved', 'approved', 'current'])
  })

  it('parks on the second step when motion is reduced', () => {
    expect(SLIP_STATIC_STEP).toBe(2)
    expect(states(SLIP_STATIC_STEP)).toEqual(['approved', 'current', 'waiting'])
  })
})
