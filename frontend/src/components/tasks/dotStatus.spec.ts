import { describe, it, expect } from 'vitest'
import { taskDotClass, taskDotTone } from './dotStatus'

describe('taskDotTone', () => {
  it.each([
    ['PENDING', 'primary'],
    ['APPROVED', 'success'],
    ['REJECTED', 'danger'],
    ['CANCELED', 'muted'],
    ['TRANSFERRED', 'warning'],
  ])('maps task status %s to the %s tone', (status, tone) => {
    expect(taskDotTone(status)).toBe(tone)
  })

  it('falls back to muted for an unknown status', () => {
    expect(taskDotTone('UNKNOWN')).toBe('muted')
  })
})

describe('taskDotClass', () => {
  it('builds the global status-dot class pair', () => {
    expect(taskDotClass('APPROVED')).toBe('status-dot status-dot--success')
    expect(taskDotClass('UNKNOWN')).toBe('status-dot status-dot--muted')
  })
})
