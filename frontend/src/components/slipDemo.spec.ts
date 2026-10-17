import { describe, expect, it } from 'vitest'
import {
  SLIP_CELL_NAMES,
  SLIP_FINAL_STEP,
  SLIP_NOTE,
  SLIP_PASSED_STAMP_TEXT,
  SLIP_PASSED_STEP_DURATION,
  SLIP_STATE_TEXT,
  SLIP_STATIC_STEP,
  SLIP_STEPS,
  SLIP_STEP_DURATION,
  clampStepIndex,
  nextStepIndex,
  stepAt,
  stepForCell,
  stepIndexForCell,
  stepIndexForStamp,
} from './slipDemo'

const states = (index: number) => stepAt(index).cells.map((cell) => cell.state)

describe('slip demo steps', () => {
  it('walks the three cells through four steps', () => {
    expect(states(1)).toEqual(['current', 'waiting', 'waiting'])
    expect(states(2)).toEqual(['approved', 'current', 'waiting'])
    expect(states(3)).toEqual(['approved', 'approved', 'current'])
    expect(states(4)).toEqual(['approved', 'approved', 'approved'])
  })

  it('names the cells after the approval chain and labels each state', () => {
    expect(stepAt(1).cells.map((cell) => cell.name)).toEqual([...SLIP_CELL_NAMES])
    expect(SLIP_CELL_NAMES).toEqual(['部门负责人', '财务审批', '企业负责人'])
    expect(SLIP_STATE_TEXT).toEqual({ current: '处理中', approved: '已同意', waiting: '待流转' })
    expect(stepAt(2).cells.map((cell) => cell.label)).toEqual(['已同意', '处理中', '待流转'])
    expect(stepAt(3).cells.map((cell) => cell.index)).toEqual([0, 1, 2])
  })

  it('carries the caption that sits below the diagram', () => {
    expect(SLIP_NOTE).toBe('一张申请怎么一级级批下来')
  })

  it('drops the passed stamp only on the final step', () => {
    expect(stepAt(1).showPassedStamp).toBe(false)
    expect(stepAt(2).showPassedStamp).toBe(false)
    expect(stepAt(3).showPassedStamp).toBe(false)
    expect(stepAt(4).showPassedStamp).toBe(true)
    expect(SLIP_PASSED_STAMP_TEXT).toBe('已通过')
    expect(SLIP_FINAL_STEP).toBe(4)
  })

  it('loops back to the first step after the last one', () => {
    expect(nextStepIndex(1)).toBe(2)
    expect(nextStepIndex(2)).toBe(3)
    expect(nextStepIndex(3)).toBe(4)
    expect(nextStepIndex(4)).toBe(1)
  })

  it('holds each step for its own duration', () => {
    expect(SLIP_STEP_DURATION).toBe(2400)
    expect(SLIP_PASSED_STEP_DURATION).toBe(3200)
    expect(stepAt(1).duration).toBe(2400)
    expect(stepAt(2).duration).toBe(2400)
    expect(stepAt(3).duration).toBe(2400)
    expect(stepAt(4).duration).toBe(3200)
    expect(SLIP_STEPS).toHaveLength(4)
  })

  it('clamps out of range and invalid steps', () => {
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

  it('maps the passed stamp to the final step', () => {
    expect(stepIndexForStamp()).toBe(SLIP_FINAL_STEP)
    expect(stepAt(stepIndexForStamp()).showPassedStamp).toBe(true)
  })

  it('parks on the second step when motion is reduced', () => {
    expect(SLIP_STATIC_STEP).toBe(2)
    expect(states(SLIP_STATIC_STEP)).toEqual(['approved', 'current', 'waiting'])
  })
})
