// ⚠ 此文件由 mobile/scripts/sync-lib.mjs 从 frontend/src/lib/api/tasks.ts 原样复制生成，请勿手动修改。
// 修改请改 Web 端源文件后执行 npm run sync-lib。
import { http } from '../http'
import type { ActionResult, ApproveBody, PageResponse, RejectBody, TaskItem, TaskQuery } from '../types'

const idem = (key: string) => ({ headers: { 'Idempotency-Key': key } })

export const tasks = {
  pending: (q: TaskQuery = {}) => http.get<PageResponse<TaskItem>>('/tasks/pending', { params: { ...q } }),
  done: (q: TaskQuery = {}) => http.get<PageResponse<TaskItem>>('/tasks/done', { params: { ...q } }),
  pendingCount: () => http.get<{ count: number }>('/tasks/pending-count'),
  approve: (taskId: number, body: ApproveBody, idemKey: string) =>
    http.post<ActionResult>(`/tasks/${taskId}/approve`, body, idem(idemKey)),
  reject: (taskId: number, body: RejectBody, idemKey: string) =>
    http.post<ActionResult>(`/tasks/${taskId}/reject`, body, idem(idemKey)),
}
