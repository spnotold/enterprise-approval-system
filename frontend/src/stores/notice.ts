import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import type { NoticeEvent, NotificationItem } from '@/lib/types'

const RECENT_SIZE = 8

export const useNoticeStore = defineStore('notice', {
  state: () => ({
    unread: 0,
    recent: [] as NotificationItem[],
    recentLoaded: false,
    /** 最近一次推送涉及的申请；详情页据此判断是否需要刷新 */
    lastAppEvent: null as { applicationId: number; at: number } | null,
    /** 最近一次收到推送的时间，列表页可据此提示刷新 */
    lastEventAt: 0,
  }),
  actions: {
    setUnread(n: number) {
      this.unread = Math.max(0, n)
    },
    async fetchUnread() {
      try {
        const r = await api.notifications.unreadCount()
        this.setUnread(r.count)
      } catch {
        // 未读数只是提醒，失败时保持原值
      }
    },
    async fetchRecent() {
      const page = await api.notifications.list({ page: 1, size: RECENT_SIZE })
      this.recent = page.records
      this.recentLoaded = true
      return this.recent
    },
    /**
     * 断线重连后补齐：/notifications/changes 返回 id > since 以及最近 60 秒内创建的通知
     * （id 不按提交顺序），因此按 id 去重后合并。
     */
    async catchUp() {
      if (!this.recentLoaded) {
        await this.fetchUnread()
        return
      }
      try {
        const since = this.recent.reduce((m, n) => Math.max(m, n.id), 0)
        const r = await api.notifications.changes(since)
        this.setUnread(r.unreadCount)
        const byId = new Map(this.recent.map((n) => [n.id, n]))
        for (const item of r.items) byId.set(item.id, { ...byId.get(item.id), ...item })
        this.recent = [...byId.values()].sort((a, b) => b.id - a.id).slice(0, RECENT_SIZE)
      } catch {
        await this.fetchUnread()
      }
    },
    /** SSE 推送：更新角标，插入最近列表 */
    onEvent(e: NoticeEvent) {
      this.setUnread(e.unreadCount)
      this.lastEventAt = Date.now()
      if (e.applicationId) this.lastAppEvent = { applicationId: e.applicationId, at: Date.now() }
      if (!this.recent.some((n) => n.id === e.id)) {
        this.recent.unshift({
          id: e.id,
          type: e.type,
          title: e.title,
          content: null,
          applicationId: e.applicationId,
          linkPath: e.linkPath,
          read: false,
          createdAt: new Date().toISOString(),
        })
        this.recent.splice(RECENT_SIZE)
      }
    },
    async markRead(id: number) {
      const item = this.recent.find((n) => n.id === id)
      await api.notifications.markRead(id)
      if (item && !item.read) item.read = true
      await this.fetchUnread()
    },
    async markAllRead() {
      await api.notifications.markAllRead()
      this.recent.forEach((n) => (n.read = true))
      this.setUnread(0)
    },
    reset() {
      this.unread = 0
      this.recent = []
      this.recentLoaded = false
      this.lastAppEvent = null
    },
  },
})

/** 通知点击后的跳转地址：优先 linkPath，其次申请详情 */
export function noticeTarget(n: { linkPath: string | null; applicationId: number | null }): string | null {
  if (n.linkPath && n.linkPath.startsWith('/') && !n.linkPath.startsWith('//')) return n.linkPath
  if (n.applicationId) return `/applications/${n.applicationId}`
  return null
}
