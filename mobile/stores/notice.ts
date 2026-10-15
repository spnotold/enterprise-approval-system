// 未读数与新通知分发：更新“消息” tab 角标，弹出 Toast，并广播事件让详情页 / 列表页自行刷新。
import { reactive } from 'vue'
import { api } from '@/lib/api'
import type { NotificationType } from '@/lib/types'
import { NOTICE_TAB_INDEX } from '@/utils/nav'

/** 新通知事件名：uni.$on(NOTICE_EVENT, (items: IncomingNotice[]) => ...) */
export const NOTICE_EVENT = 'eas:notice'

export interface IncomingNotice {
  id: number
  type: NotificationType
  title: string
  applicationId: number | null
  linkPath: string | null
}

const state = reactive({
  unread: 0,
  /** 已见过的最大通知 ID，增量拉取的 since */
  lastId: 0,
})

// 增量接口除 id > since 外还会返回最近 60 秒内创建的通知（ID 不按提交顺序），按 ID 去重
const seen = new Set<number>()
const SEEN_LIMIT = 500

function markSeen(id: number): void {
  seen.add(id)
  if (seen.size > SEEN_LIMIT) {
    let drop = seen.size - SEEN_LIMIT
    for (const old of seen) {
      if (drop-- <= 0) break
      seen.delete(old)
    }
  }
  state.lastId = Math.max(state.lastId, id)
}

function applyBadge(): void {
  const n = state.unread
  // 当前页面不是 tab 页时小程序会报错，忽略即可；进入 tab 页时会再次设置
  if (n > 0) {
    uni.setTabBarBadge({ index: NOTICE_TAB_INDEX, text: n > 99 ? '99+' : String(n), fail: () => {} })
  } else {
    uni.removeTabBarBadge({ index: NOTICE_TAB_INDEX, fail: () => {} })
  }
}

export const notice = {
  state,

  applyBadge,

  setUnread(n: number): void {
    state.unread = Math.max(0, n)
    applyBadge()
  },

  /** 标记已读后本地减一，避免等待下一次拉取 */
  decrease(n = 1): void {
    notice.setUnread(state.unread - n)
  },

  /** 登录后初始化：记下已有的通知（不再弹出提示）与未读数 */
  async init(): Promise<void> {
    const [page, cnt] = await Promise.all([
      api.notifications.list({ page: 1, size: 20 }),
      api.notifications.unreadCount(),
    ])
    for (const r of page.records) markSeen(r.id)
    notice.setUnread(cnt.count)
  },

  /** SSE 推送或增量拉取到的通知：按 ID 去重，since 推进到见过的最大 ID */
  receive(items: IncomingNotice[], unreadCount: number): void {
    const fresh = items.filter((i) => !seen.has(i.id)).sort((a, b) => a.id - b.id)
    for (const i of fresh) markSeen(i.id)
    notice.setUnread(unreadCount)
    if (!fresh.length) return
    const latest = fresh[fresh.length - 1]
    uni.showToast({
      title: fresh.length === 1 ? latest.title : `${fresh.length} 条新消息：${latest.title}`,
      icon: 'none',
      duration: 3000,
    })
    uni.$emit(NOTICE_EVENT, fresh)
  },

  /** 通知列表页加载到的通知视为已见，避免之后被当作新通知弹出 */
  markSeen(ids: number[]): void {
    for (const id of ids) markSeen(id)
  },

  reset(): void {
    state.unread = 0
    state.lastId = 0
    seen.clear()
    applyBadge()
  },
}
