import { describe, expect, it } from 'vitest'
import { getScrollBehavior } from './scrollBehavior'

describe('getScrollBehavior', () => {
  it.each(['/tasks/done', '/tasks/pending'])('restores a saved position before comparing paths: %s', (path) => {
    const savedPosition = { left: 12, top: 340 }
    expect(getScrollBehavior({ path }, { path: '/tasks/pending' }, savedPosition))
      .toBe(savedPosition)
  })

  it('preserves scroll when only query or hash changes on the same path', () => {
    expect(getScrollBehavior({ path: '/tasks/pending' }, { path: '/tasks/pending' }, null)).toBe(false)
  })

  it('resets scroll to the top when navigating to another path', () => {
    expect(getScrollBehavior({ path: '/tasks/done' }, { path: '/tasks/pending' }, null)).toEqual({ top: 0 })
  })
})
