import { describe, expect, it } from 'vitest'
import { visibleSections } from './menu'
import { detailSectionHint } from './sectionContext'

const all = visibleSections(() => true)

describe('detail section context', () => {
  it('keeps the list origin ahead of applicant ownership', () => {
    expect(detailSectionHint(['pending'], all, 7, 7)).toBe('approval')
    expect(detailSectionHint(['/applications/mine?page=2'], all, 8, 7)).toBe('application')
  })
  it('preserves remembered context through detail and edit navigation', () => {
    expect(detailSectionHint([undefined, 'approval', '/applications/12'], all)).toBe('approval')
  })
  it('falls back to the applicant or approver section for a direct link', () => {
    expect(detailSectionHint([], all, 7, 7)).toBe('application')
    expect(detailSectionHint([], all, 8, 7)).toBe('approval')
  })
  it('does not guess ownership before the detail request resolves', () => {
    expect(detailSectionHint([], all)).toBeUndefined()
  })
  it('ignores stale, unrelated, and external origins', () => {
    expect(detailSectionHint(['/stats', '/admin/users', 'https://example.com/tasks/pending', '/tasks/pending-fake'], all)).toBeUndefined()
  })
  it('ignores hints and ownership fallbacks hidden by current permissions', () => {
    const employee = visibleSections((permission) => permission === 'APP_CREATE')
    expect(detailSectionHint(['pending', '/applications/mine'], employee)).toBe('application')
    expect(detailSectionHint(['approval'], employee, 8, 7)).toBeUndefined()
  })
  it('recognizes department and granted lists as approval origins', () => {
    expect(detailSectionHint(['dept'], all)).toBe('approval')
    expect(detailSectionHint(['/applications/granted'], all)).toBe('approval')
  })
})
