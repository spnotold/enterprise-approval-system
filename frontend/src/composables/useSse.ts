// SSE 实时通知：先用访问令牌换一次性票据，再建立 EventSource；
// 断线后用新票据退避重连，连续失败 3 次降级为每 15 秒轮询未读数（期间每 2 分钟再试一次 SSE）。
import { onBeforeUnmount, onMounted } from 'vue'
import { api } from '@/lib/api'
import type { NoticeEvent } from '@/lib/types'
import { useNoticeStore } from '@/stores/notice'

const MAX_FAILURES = 3
const POLL_MS = 15_000
const RETRY_WHILE_POLLING_MS = 120_000

export function useSse(onMessage: (n: NoticeEvent) => void) {
  const notice = useNoticeStore()
  let es: EventSource | null = null
  let failures = 0
  let stopped = false
  let reconnectTimer: number | undefined
  let pollTimer: number | undefined
  let retryTimer: number | undefined

  function startPolling() {
    if (pollTimer !== undefined) return
    void notice.fetchUnread()
    pollTimer = window.setInterval(() => void notice.fetchUnread(), POLL_MS)
    // 降级期间定期尝试恢复 SSE
    retryTimer = window.setInterval(() => {
      if (!es) void connect()
    }, RETRY_WHILE_POLLING_MS)
  }

  function stopPolling() {
    if (pollTimer !== undefined) window.clearInterval(pollTimer)
    if (retryTimer !== undefined) window.clearInterval(retryTimer)
    pollTimer = undefined
    retryTimer = undefined
  }

  function onFailure() {
    if (stopped) return
    failures += 1
    if (failures >= MAX_FAILURES) {
      startPolling()
      return
    }
    window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(() => void connect(), 2000 * 2 ** (failures - 1))
  }

  async function connect() {
    if (stopped || es) return
    let ticket: string
    try {
      // EventSource 不能带请求头，先用访问令牌换一次性票据（60 秒有效，用一次即作废）
      ticket = (await api.auth.sseTicket()).ticket
    } catch {
      onFailure()
      return
    }
    if (stopped) return
    const source = new EventSource(`/api/notifications/stream?ticket=${encodeURIComponent(ticket)}`)
    es = source
    source.onopen = () => {
      failures = 0
      stopPolling()
      // 断线期间可能漏掉推送，连上后补齐（按 id 去重）
      void notice.catchUp()
    }
    source.addEventListener('notification', (e) => {
      failures = 0
      try {
        onMessage(JSON.parse((e as MessageEvent<string>).data) as NoticeEvent)
      } catch {
        // 忽略无法解析的消息
      }
    })
    source.onerror = () => {
      // 票据只能用一次，EventSource 自带的重连会失败，主动关闭后换新票据重连
      source.close()
      if (es === source) es = null
      onFailure()
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') {
      void notice.fetchUnread()
      if (!es && pollTimer === undefined && !stopped) {
        failures = 0
        void connect()
      }
    }
  }

  function stop() {
    stopped = true
    es?.close()
    es = null
    window.clearTimeout(reconnectTimer)
    stopPolling()
    document.removeEventListener('visibilitychange', onVisible)
  }

  onMounted(() => {
    void notice.fetchUnread()
    void connect()
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(stop)

  return { stop }
}
