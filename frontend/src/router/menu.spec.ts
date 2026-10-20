import { describe, expect, it } from 'vitest'
import { activeMenuPath, activeSection, adminMenuGroups, visibleMenu, visibleSections } from './menu'

const allow = (...permissions: string[]) => (permission: string) => permissions.includes(permission)

describe('visibleSections', () => {
  it('keeps the five design sections in order and excludes notifications', () => {
    const sections = visibleSections(() => true)
    expect(sections.map(({ id, label }) => [id, label])).toEqual([
      ['workbench', '工作台'],
      ['application', '申请'],
      ['approval', '审批'],
      ['stats', '统计'],
      ['admin', '管理'],
    ])
    expect(sections.map((section) => section.items.map((item) => item.path))).toEqual([
      ['/'],
      ['/apply', '/applications/mine'],
      ['/tasks/pending', '/tasks/done', '/dept/applications', '/applications/granted'],
      ['/stats'],
      [
        '/admin/registrations', '/admin/users', '/admin/departments', '/admin/roles', '/admin/grants',
        '/admin/templates', '/admin/expense-types', '/admin/config', '/admin/tasks', '/admin/audit-logs',
        '/admin/deliveries',
      ],
    ])
  })

  it('filters each item by its existing permission and removes empty sections', () => {
    const sections = visibleSections(allow('APP_READ_DEPT', 'ADMIN_CONFIG'))
    expect(sections.map((section) => section.id)).toEqual(['workbench', 'approval', 'stats', 'admin'])
    expect(sections.find((section) => section.id === 'approval')?.items.map((item) => item.path)).toEqual([
      '/dept/applications',
    ])
    expect(sections.find((section) => section.id === 'admin')?.items.map((item) => item.path)).toEqual([
      '/admin/expense-types', '/admin/config', '/admin/deliveries',
    ])
  })

  it('returns fresh section and item arrays on each call', () => {
    const first = visibleSections(allow('TASK_HANDLE'))
    const second = visibleSections(allow('TASK_HANDLE'))
    first[1].items.pop()
    expect(second.find((section) => section.id === 'approval')?.items).toHaveLength(2)
  })
})

describe('adminMenuGroups', () => {
  it('groups all eleven admin routes in design order', () => {
    const admin = visibleSections(() => true).find((section) => section.id === 'admin')!
    expect(adminMenuGroups(admin.items).map(({ label, items }) => [label, items.map((item) => item.path)])).toEqual([
      ['人员', ['/admin/registrations', '/admin/users', '/admin/departments', '/admin/roles', '/admin/grants']],
      ['流程', ['/admin/templates', '/admin/expense-types', '/admin/tasks']],
      ['系统', ['/admin/config', '/admin/audit-logs', '/admin/deliveries']],
    ])
  })

  it('omits empty groups after permission filtering', () => {
    const admin = visibleSections(allow('ADMIN_TEMPLATE')).find((section) => section.id === 'admin')!
    expect(adminMenuGroups(admin.items).map(({ label, items }) => [label, items.map((item) => item.path)])).toEqual([
      ['流程', ['/admin/templates']],
    ])
    expect(adminMenuGroups([])).toEqual([])
  })
})

describe('activeSection', () => {
  const all = visibleSections(() => true)

  it.each([
    ['/', 'workbench'],
    ['/apply', 'application'],
    ['/applications/mine', 'application'],
    ['/tasks/pending', 'approval'],
    ['/tasks/done', 'approval'],
    ['/dept/applications', 'approval'],
    ['/applications/granted', 'approval'],
    ['/stats', 'stats'],
    ['/admin/users', 'admin'],
    ['/apply/purchase', 'application'],
    ['/apply/travel', 'application'],
    ['/apply/expense', 'application'],
    ['/apply/custom/12', 'application'],
    ['/admin/templates/12/design', 'admin'],
  ])('maps %s to %s', (path, expected) => {
    expect(activeSection(path, all)).toBe(expected)
  })

  it('uses a visible list path or section id as detail/edit context', () => {
    expect(activeSection('/applications/12', all, '/tasks/pending')).toBe('approval')
    expect(activeSection('/applications/12', all, '/applications/granted')).toBe('approval')
    expect(activeSection('/applications/12/edit', all, '/applications/mine')).toBe('application')
    expect(activeSection('/applications/12', all, 'approval')).toBe('approval')
    expect(activeSection('/applications/12/edit', all, 'application')).toBe('application')
    expect(activeSection('/applications/12', all)).toBe('application')
  })

  it('ignores stale or unauthorized hints and prefers application when available', () => {
    const sections = visibleSections(allow('APP_CREATE', 'APP_READ_DEPT'))
    expect(activeSection('/applications/12', sections, '/tasks/pending')).toBe('application')
    expect(activeSection('/applications/12', sections, 'old-section')).toBe('application')
    expect(activeSection('/applications/12', sections, 'admin')).toBe('application')
    expect(activeSection('/applications/12', sections, '/admin/users')).toBe('application')
    expect(activeSection('/applications/12', sections, '/dept/applications')).toBe('approval')
  })

  it('falls back to visible approval context, or no section when neither is visible', () => {
    const approvalOnly = visibleSections(allow('TASK_HANDLE'))
    expect(activeSection('/applications/12', approvalOnly, '/applications/mine')).toBe('approval')
    expect(activeSection('/applications/12/edit', approvalOnly)).toBe('approval')
    expect(activeSection('/applications/12', visibleSections(allow()))).toBe('')
  })

  it('does not treat unknown routes or /applications/new as application details', () => {
    for (const path of [
      '/applications/new', '/applications/12/history', '/applications/12/edit/extra', '/applications/abc',
      '/applications/12x', '/apply/unknown', '/admin/templates/new/design', '/notifications', '/profile', '/403',
      '/not-found',
    ]) {
      expect(activeSection(path, all, 'approval')).toBe('')
    }
  })

  it('never chooses a hidden direct route or a hidden form parent', () => {
    const sections = visibleSections(allow('APP_READ_DEPT'))
    expect(activeSection('/tasks/pending', sections)).toBe('')
    expect(activeSection('/apply/purchase', sections)).toBe('')
    expect(activeSection('/admin/templates/1/design', sections)).toBe('')
  })
})

describe('legacy menu exports', () => {
  it('keeps notification and existing permission filtering in visibleMenu', () => {
    const groups = visibleMenu(allow('TASK_HANDLE'))
    expect(groups.map((group) => group.title)).toEqual([null, '审批', '统计与消息'])
    expect(groups[2].items.map((item) => item.path)).toEqual(['/stats', '/notifications'])
  })

  it('keeps activeMenuPath longest-prefix behavior', () => {
    const groups = visibleMenu(allow('APP_CREATE', 'ADMIN_TEMPLATE'))
    expect(activeMenuPath('/', groups)).toBe('/')
    expect(activeMenuPath('/apply/purchase', groups)).toBe('/apply')
    expect(activeMenuPath('/applications/mine/12', groups)).toBe('/applications/mine')
    expect(activeMenuPath('/admin/templates/2/design', groups)).toBe('/admin/templates')
    expect(activeMenuPath('/applications/new', groups)).toBe('')
  })
})
