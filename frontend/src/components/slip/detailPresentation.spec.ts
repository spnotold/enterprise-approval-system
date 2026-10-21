import { describe, expect, it, vi } from 'vitest'
import type { FlowNodeView } from '@/lib/types'
import { detailBackLabel, detailStatusSentence, signatureWaitDays } from './detailPresentation'

const wu = { id: 2, realName: '吴审' }
const li = { id: 3, realName: '李研' }
const active: FlowNodeView = {
  seq: 2, nodeKey: 'finance', name: '财务审批', status: 'ACTIVE', mode: 'COUNTERSIGN', effective: true,
  conditionResult: null, conditionText: null, assignee: wu, candidates: [wu, li], requiredCount: 2, approvedCount: 1,
  resolveNote: null, activatedAt: null, finishedAt: null,
  tasks: [
    { id: 1, assignee: li, status: 'APPROVED', comment: null, createdAt: '', actedAt: null },
    { id: 2, assignee: wu, status: 'PENDING', comment: null, createdAt: '', actedAt: null },
  ],
}
const detail = (nodes: FlowNodeView[] = [active]) => ({ status: 'IN_APPROVAL' as const, currentNodeSeq: 2, flow: { templateCode: 'test', versionNo: 1, nodes } })

describe('detail presentation', () => {
  it('names only remaining handlers in a partially completed countersign', () => {
    expect(detailStatusSentence(detail())).toBe('轮到财务审批，处理人 吴审')
  })
  it('uses all candidates when pending task data is unavailable', () => {
    expect(detailStatusSentence(detail([{ ...active, tasks: [] }]))).toBe('轮到财务审批，处理人 吴审、李研')
  })
  it('handles unassigned and missing flow data', () => {
    expect(detailStatusSentence(detail([{ ...active, tasks: [], candidates: [], assignee: null }]))).toBe('轮到财务审批，待分配处理人')
    expect(detailStatusSentence({ ...detail(), flow: null })).toBe('审批中，等待处理')
  })
  it('describes terminal and draft states without stale handler names', () => {
    expect(detailStatusSentence({ ...detail(), status: 'APPROVED' })).toBe('已通过')
    expect(detailStatusSentence({ ...detail(), status: 'REJECTED' }, true)).toBe('已驳回，可复制并修改后重新提交')
    expect(detailStatusSentence({ ...detail(), status: 'WITHDRAWN' })).toContain('已撤回')
    expect(detailStatusSentence({ ...detail(), status: 'DRAFT' })).toBe('草稿，尚未提交')
  })
  it('only suggests copying when the viewer can copy', () => {
    expect(detailStatusSentence({ ...detail(), status: 'REJECTED' })).toBe('已驳回')
    expect(detailStatusSentence({ ...detail(), status: 'WITHDRAWN' })).toBe('已撤回')
    expect(detailStatusSentence({ ...detail(), status: 'WITHDRAWN' }, true)).toBe('已撤回，可复制并修改后重新提交')
  })
  it('labels the actual history destination and leaves unknown destinations generic', () => {
    expect(detailBackLabel('/tasks/pending?keyword=采购')).toBe('返回我的待办')
    expect(detailBackLabel('/applications/mine')).toBe('返回我的申请')
    expect(detailBackLabel('/applications/42')).toBe('返回')
    expect(detailBackLabel(null)).toBe('返回')
  })
})

describe('signature waiting time', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  it('counts complete days from node activation rather than a transferred task', () => {
    expect(signatureWaitDays({ activatedAt: '2026-10-16T11:00:00Z' }, [{ createdAt: '2026-10-19T12:00:00Z' }], now)).toBe(4)
  })
  it('uses task creation when activation is unavailable and preserves same-day processing', () => {
    expect(signatureWaitDays({ activatedAt: null }, [{ createdAt: '2026-10-20T11:00:00Z' }], now)).toBe(0)
  })
  it('updates the wait count when the shared clock crosses a full day', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(now)
      const node = { activatedAt: '2026-10-19T12:00:30Z' }
      expect(signatureWaitDays(node, [], Date.now())).toBe(0)
      vi.advanceTimersByTime(30_000)
      expect(signatureWaitDays(node, [], Date.now())).toBe(1)
    } finally { vi.useRealTimers() }
  })
  it('omits elapsed time for missing, invalid, or future timestamps', () => {
    expect(signatureWaitDays({ activatedAt: null }, [], now)).toBeNull()
    expect(signatureWaitDays({ activatedAt: 'invalid' }, [], now)).toBeNull()
    expect(signatureWaitDays({ activatedAt: '2026-10-21T11:00:00Z' }, [], now)).toBeNull()
  })
})
