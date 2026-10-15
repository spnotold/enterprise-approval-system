// 实时提醒：
// - H5：POST /api/auth/sse-ticket 换一次性票据，再 EventSource('/api/notifications/stream?ticket=…')，
//   事件名 notification。断线后用新票据重连；连续失败 3 次降级为每 15 秒增量拉取。
// - 小程序：没有 EventSource。前台时每 15 秒请求 /api/notifications/changes?since=，
//   App onShow 立即拉取一次，onHide 停止。
// 推送只是提醒，数据以接口查询为准；连上 SSE 时补拉一次断线期间的通知。

import { api } from '@/lib/api'
import type { NoticeEvent } from '@/lib/types'
import { notice } from './notice'
// #ifdef H5
import { API_BASE } from '@/lib/config'
// #endif

const POLL_MS = 15_000

let running = false
let initDone: Promise<void> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let polling = false

async function pullChanges(): Promise<void> {
  if (!running || polling) return
  polling = true
  try {
    await initDone
    const r = await api.notifications.changes(notice.state.lastId)
    if (running) notice.receive(r.items, r.unreadCount)
  } catch {
    // 拉取失败（网络波动等）等下一轮
  } finally {
    polling = false
  }
}

function startPolling(): void {
  stopPolling()
  void pullChanges()
  pollTimer = setInterval(() => void pullChanges(), POLL_MS)
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

// #ifdef H5
let es: EventSource | null = null
let failures = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let degraded = false

function closeSse(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  es?.close()
  es = null
}

function onSseFailure(): void {
  closeSse()
  if (!running) return
  failures++
  if (failures >= 3) {
    degraded = true
    startPolling()
  } else {
    retryTimer = setTimeout(() => void connectSse(), 2000 * failures)
  }
}

async function connectSse(): Promise<void> {
  if (!running || es) return
  try {
    await initDone
    // EventSource 不能设置请求头，先用访问令牌换一次性票据
    const { ticket } = await api.auth.sseTicket()
    if (!running) return
    const source = new EventSource(`${API_BASE}/notifications/stream?ticket=${encodeURIComponent(ticket)}`)
    es = source
    source.addEventListener('open', () => {
      failures = 0
      void pullChanges() // 补齐断线期间的通知
    })
    source.addEventListener('notification', (e) => {
      failures = 0
      try {
        const ev = JSON.parse((e as MessageEvent<string>).data) as NoticeEvent
        notice.receive([ev], ev.unreadCount)
      } catch {
        // 忽略无法解析的事件
      }
    })
    source.onerror = () => {
      if (es === source) onSseFailure()
    }
  } catch {
    onSseFailure()
  }
}
// #endif

export const realtime = {
  /** 登录后（或带着令牌启动时）调用 */
  start(): void {
    if (running) return
    running = true
    initDone = notice.init().catch(() => {})
    // #ifdef H5
    failures = 0
    degraded = false
    void connectSse()
    // #endif
    // #ifndef H5
    startPolling()
    // #endif
  },

  stop(): void {
    running = false
    initDone = null
    stopPolling()
    // #ifdef H5
    closeSse()
    // #endif
    notice.reset()
  },

  /** App onShow：小程序回到前台立即拉取并恢复轮询；H5 若已降级则补拉一次 */
  onAppShow(): void {
    if (!running) return
    // #ifndef H5
    startPolling()
    // #endif
    // #ifdef H5
    if (degraded) void pullChanges()
    else if (!es && !retryTimer) void connectSse()
    // #endif
  },

  /** App onHide：小程序进入后台停止轮询 */
  onAppHide(): void {
    // #ifndef H5
    stopPolling()
    // #endif
  },

  /** 手动刷新（如进入消息页）：立即增量拉取一次 */
  pull(): Promise<void> {
    return pullChanges()
  },
}
