import { describe, expect, it } from 'vitest'
import { sectionTabLink } from './sectionTabLink'

describe('sectionTabLink', () => {
  it('keeps the current query except page when switching between task lists', () => {
    const query = { keyword: 'QA', type: 'EXPENSE', page: '2' }
    expect(sectionTabLink('/tasks/done', '/tasks/pending', query)).toEqual({
      path: '/tasks/done',
      query: { keyword: 'QA', type: 'EXPENSE' },
    })
    expect(sectionTabLink('/tasks/pending', '/tasks/done', query)).toEqual({
      path: '/tasks/pending',
      query: { keyword: 'QA', type: 'EXPENSE' },
    })
  })

  it('drops an empty query to a clean task-list link', () => {
    expect(sectionTabLink('/tasks/done', '/tasks/pending', {})).toEqual({ path: '/tasks/done', query: {} })
    expect(sectionTabLink('/tasks/done', '/tasks/pending', { page: '3' })).toEqual({ path: '/tasks/done', query: {} })
  })

  it('uses bare paths for non-task targets', () => {
    const query = { keyword: 'QA', type: 'EXPENSE', page: '2' }
    expect(sectionTabLink('/dept/applications', '/tasks/pending', query)).toBe('/dept/applications')
    expect(sectionTabLink('/applications/mine', '/tasks/pending', query)).toBe('/applications/mine')
  })

  it('uses bare paths when the active tab is not a task list', () => {
    const query = { keyword: 'QA', page: '2' }
    expect(sectionTabLink('/tasks/pending', '/dept/applications', query)).toBe('/tasks/pending')
    expect(sectionTabLink('/tasks/pending', '', query)).toBe('/tasks/pending')
  })
})
