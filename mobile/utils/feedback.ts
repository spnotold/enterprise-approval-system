// 统一的提示、确认框与错误处理：uni.showToast / uni.showModal / uni.showLoading。
import { toApiError } from '@/lib/http'

export function toast(title: string, icon: 'none' | 'success' | 'error' = 'none'): void {
  uni.showToast({ title, icon, duration: title.length > 12 ? 2600 : 1800 })
}

export function loading(title = '加载中'): void {
  uni.showLoading({ title, mask: true })
}

export function hideLoading(): void {
  uni.hideLoading()
}

export interface ConfirmOptions {
  title?: string
  content: string
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认按钮显示为红色 */
  danger?: boolean
  showCancel?: boolean
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: opts.title ?? '提示',
      content: opts.content,
      confirmText: opts.confirmText ?? '确定',
      cancelText: opts.cancelText ?? '取消',
      confirmColor: opts.danger ? '#e5484d' : '#2f6bff',
      showCancel: opts.showCancel ?? true,
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    })
  })
}

export function alert(title: string, content: string): Promise<void> {
  return confirm({ title, content, showCancel: false, confirmText: '知道了' }).then(() => undefined)
}

export interface ErrorHandlers {
  /** 409 类冲突时“刷新”按钮的回调 */
  onRefresh?: () => void
}

/**
 * 按错误码统一提示：
 * 409（状态已变化、待办已被处理、草稿在别处修改）→ 弹窗并提供“刷新”；
 * 500 → 弹窗显示 traceId；其余 → Toast 显示服务端 message。
 */
export function showError(err: unknown, h: ErrorHandlers = {}): void {
  uni.hideLoading()
  const e = toApiError(err)
  // 令牌失效时 http 层已跳转登录页
  if (e.code === 40101 || e.code === 40102) return
  if (e.code === 40903) {
    toast('相同请求正在处理中，请稍候')
    return
  }
  if (e.code === 40901 || e.code === 40902 || e.code === 40905) {
    const title = e.code === 40905 ? '草稿已在别处修改' : '申请状态已变化'
    uni.showModal({
      title,
      content: `${e.message}。请刷新后查看最新状态。${e.code === 40905 ? '刷新将用服务器草稿覆盖当前未保存的修改。' : ''}`,
      confirmText: '刷新',
      showCancel: !!h.onRefresh,
      success: (r) => {
        if (r.confirm) h.onRefresh?.()
      },
    })
    return
  }
  if (e.code === 50000 || (e.httpStatus !== null && e.httpStatus >= 500)) {
    uni.showModal({
      title: '服务器错误',
      content: `${e.message}\n追踪号：${e.traceId ?? '无'}`,
      showCancel: false,
      confirmText: '知道了',
    })
    return
  }
  const first = e.errors.find((x) => x.message)
  toast(first && e.errors.length === 1 ? first.message : e.message)
}
