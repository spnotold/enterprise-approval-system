// ⚠ 此文件由 mobile/scripts/sync-lib.mjs 从 frontend/src/lib/api/notifications.ts 原样复制生成，请勿手动修改。
// 修改请改 Web 端源文件后执行 npm run sync-lib。
import { http } from '../http'
import type { NotificationChanges, NotificationItem, PageQuery, PageResponse } from '../types'

export const notifications = {
  list: (q: PageQuery & { unreadOnly?: boolean } = {}) =>
    http.get<PageResponse<NotificationItem>>('/notifications', { params: { ...q } }),
  unreadCount: () => http.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: number) => http.post<void>(`/notifications/${id}/read`),
  markAllRead: () => http.post<{ updated: number }>('/notifications/read-all'),
  /** 增量拉取（小程序轮询 / SSE 断线补齐）：返回 id > since 的通知 */
  changes: (since: number) => http.get<NotificationChanges>('/notifications/changes', { params: { since } }),
}
