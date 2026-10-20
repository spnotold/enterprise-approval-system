import type { ApplicationDetail, FlowNodeView, TaskView } from '@/lib/types'

/** 仅从服务端返回的节点和待办描述当前状态，不推断操作权限。 */
export function detailStatusSentence(detail: Pick<ApplicationDetail, 'status' | 'flow' | 'currentNodeSeq'>, canCopy = false): string {
  if (detail.status === 'APPROVED') return '已通过'
  if (detail.status === 'REJECTED') return canCopy ? '已驳回，可复制并修改后重新提交' : '已驳回'
  if (detail.status === 'WITHDRAWN') return canCopy ? '已撤回，可复制并修改后重新提交' : '已撤回'
  if (detail.status === 'DRAFT') return '草稿，尚未提交'
  const node = detail.flow?.nodes.find((node) => node.seq === detail.currentNodeSeq && node.status === 'ACTIVE')
    ?? detail.flow?.nodes.find((node) => node.status === 'ACTIVE')
  if (!node) return '审批中，等待处理'
  const pending = node.tasks.filter((task) => task.status === 'PENDING').map((task) => task.assignee.realName)
  const names = [...new Set(pending.length ? pending : node.candidates.length ? node.candidates.map((user) => user.realName) : node.assignee ? [node.assignee.realName] : [])]
  return `轮到${node.name}，${names.length ? `处理人 ${names.join('、')}` : '待分配处理人'}`
}

const LIST_NAMES: Record<string, string> = {
  '/tasks/pending': '我的待办',
  '/tasks/done': '我的已办',
  '/applications/mine': '我的申请',
  '/dept/applications': '部门申请',
  '/applications/granted': '授权申请',
  '/': '工作台',
  '/apply': '发起申请',
}

/** 返回按钮仍使用浏览器后退，只在真实返回目标明确时说明列表名。 */
export function detailBackLabel(backPath: unknown): string {
  if (typeof backPath !== 'string') return '返回'
  const name = LIST_NAMES[backPath.split(/[?#]/)[0] ?? '']
  return name ? `返回${name}` : '返回'
}

/** 激活时间优先；历史记录缺失时使用待办创建时间，未来或无效时间不显示等待天数。 */
export function signatureWaitDays(node: Pick<FlowNodeView, 'activatedAt'>, pending: Pick<TaskView, 'createdAt'>[], now = Date.now()): number | null {
  const startedAt = node.activatedAt ?? pending[0]?.createdAt
  if (!startedAt) return null
  const elapsed = now - Date.parse(startedAt)
  return Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed / 86_400_000) : null
}
