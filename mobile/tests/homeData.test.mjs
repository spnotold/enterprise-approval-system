import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './loadTs.mjs'

const {
  createInitialHomeState,
  loadAllSections,
  loadPendingSection,
  loadStatsSection,
  loadTemplatesSection,
  loadNoticesSection,
} = loadTs('pages/home/homeData.ts')

const mockStats = {
  statusCounts: { DRAFT: 1, IN_APPROVAL: 2, APPROVED: 5, REJECTED: 0, WITHDRAWN: 0 },
  pendingTaskCount: 3,
  approvedAmountCents: 150000,
  approvedCount: 5,
}

const mockNotices = [
  { id: 101, title: '出差申请已审批通过', read: false, createdAt: '2026-10-16T10:00:00Z' },
]

const mockTemplates = [
  { id: 1, name: '采购申请', category: 'BUILTIN', bizType: 'PURCHASE', formSchema: [] },
  { id: 2, name: '差旅申请', category: 'BUILTIN', bizType: 'TRAVEL', formSchema: [] },
]

const mockTasks = [
  { taskId: 201, applicationId: 301, type: 'PURCHASE', title: '采购键盘', applicant: { realName: '王工' }, createdAt: '2026-10-16T11:00:00Z' },
]

test('模拟待办接口 reject、其他接口 resolve，断言其他区域数据被正确赋值', async () => {
  const state = createInitialHomeState()

  const apis = {
    fetchStats: async () => mockStats,
    fetchNotices: async () => ({ records: mockNotices, total: 1, page: 1, size: 5 }),
    fetchTemplates: async () => mockTemplates,
    fetchPending: async () => {
      throw new Error('待办服务网络超时')
    },
  }

  await loadAllSections(apis, state, {
    canHandle: true,
    canCreate: true,
    adminOnly: false,
  })

  // 待办区域失败并显示错误
  assert.equal(state.pendingError, '待办服务网络超时')
  assert.equal(state.pending.length, 0)
  assert.equal(state.pendingLoading, false)

  // 其他区域正常赋值展示
  assert.equal(state.stats.pendingTaskCount, 3)
  assert.equal(state.stats.statusCounts.APPROVED, 5)
  assert.equal(state.statsError, '')
  assert.equal(state.statsLoading, false)

  assert.equal(state.templates.length, 2)
  assert.equal(state.templates[0].name, '采购申请')
  assert.equal(state.templatesError, '')
  assert.equal(state.templatesLoading, false)

  assert.equal(state.notices.length, 1)
  assert.equal(state.notices[0].id, 101)
  assert.equal(state.noticesError, '')
  assert.equal(state.noticesLoading, false)
})

test('失败区域可独立重试成功，不影响其他已有数据', async () => {
  const state = createInitialHomeState()

  // 初始加载：待办接口失败
  let failPending = true
  const apis = {
    fetchStats: async () => mockStats,
    fetchNotices: async () => ({ records: mockNotices, total: 1, page: 1, size: 5 }),
    fetchTemplates: async () => mockTemplates,
    fetchPending: async () => {
      if (failPending) throw new Error('待办服务临时故障')
      return { records: mockTasks, total: 1, page: 1, size: 3 }
    },
  }

  await loadAllSections(apis, state, { canHandle: true, canCreate: true })
  assert.equal(state.pendingError, '待办服务临时故障')
  assert.equal(state.stats.pendingTaskCount, 3)

  // 重试待办区域
  failPending = false
  await loadPendingSection(apis, state, { canHandle: true })

  // 待办成功恢复，错误清除
  assert.equal(state.pendingError, '')
  assert.equal(state.pending.length, 1)
  assert.equal(state.pending[0].taskId, 201)
  assert.equal(state.pendingTotal, 1)

  // 其他区域数据保持完好
  assert.equal(state.stats.pendingTaskCount, 3)
  assert.equal(state.templates.length, 2)
  assert.equal(state.notices.length, 1)
})

test('某非待办区域失败时，待办与其他区域正常加载', async () => {
  const state = createInitialHomeState()

  const apis = {
    fetchStats: async () => {
      throw new Error('统计计算失败')
    },
    fetchNotices: async () => ({ records: mockNotices, total: 1, page: 1, size: 5 }),
    fetchTemplates: async () => mockTemplates,
    fetchPending: async () => ({ records: mockTasks, total: 1, page: 1, size: 3 }),
  }

  await loadAllSections(apis, state, { canHandle: true, canCreate: true })

  assert.equal(state.statsError, '统计计算失败')
  assert.equal(state.stats, null)

  assert.equal(state.pendingError, '')
  assert.equal(state.pending.length, 1)
  assert.equal(state.pending[0].taskId, 201)

  assert.equal(state.templatesError, '')
  assert.equal(state.templates.length, 2)

  assert.equal(state.noticesError, '')
  assert.equal(state.notices.length, 1)
})

test('adminOnly 仅拉取通知，无审批权限不调用待办', async () => {
  const state = createInitialHomeState()
  let pendingCalled = false
  let statsCalled = false
  let templatesCalled = false
  let noticesCalled = false

  const apis = {
    fetchStats: async () => {
      statsCalled = true
      return mockStats
    },
    fetchNotices: async () => {
      noticesCalled = true
      return { records: mockNotices, total: 1, page: 1, size: 5 }
    },
    fetchTemplates: async () => {
      templatesCalled = true
      return mockTemplates
    },
    fetchPending: async () => {
      pendingCalled = true
      return { records: mockTasks, total: 1, page: 1, size: 3 }
    },
  }

  await loadAllSections(apis, state, { adminOnly: true })
  assert.equal(noticesCalled, true)
  assert.equal(statsCalled, false)
  assert.equal(templatesCalled, false)
  assert.equal(pendingCalled, false)
})
