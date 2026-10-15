// 提交、撤回、批准、驳回等操作：二次确认、loading、幂等键、409 提示刷新、500 显示 traceId
import { ref, type VNode } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { newIdemKey } from '@/lib/idem'
import { toApiError, type ApiError } from '@/lib/http'
import { ERROR_HINT, showError } from '@/lib/errors'

export interface ConfirmOptions {
  title?: string
  message: string | VNode
  type?: 'warning' | 'info' | 'error' | 'success'
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认按钮显示为红色 */
  danger?: boolean
}

export interface RunOptions<T> {
  /** 二次确认；不传则直接执行 */
  confirm?: ConfirmOptions | null
  /** 实际请求；idemKey 在确认框打开时生成，同一次操作的重试复用 */
  action: (idemKey: string) => Promise<T>
  success?: string | ((r: T) => string) | null
  /** 409 状态已变化：用户点“刷新”后的回调 */
  onConflict?: () => unknown
  /** 自行处理特定错误，返回 true 表示已处理 */
  onError?: (e: ApiError) => boolean | void | Promise<boolean | void>
  /** 由调用方生成的幂等键（如审批面板在打开时生成） */
  idemKey?: string
}

/** 网络中断、网关超时、相同请求处理中：用同一幂等键重试是安全的 */
function isRetriable(err: ApiError): boolean {
  if (err.code === 40903) return true
  return err.code === -1 && (err.httpStatus === null || err.httpStatus >= 500)
}

export async function conflictAlert(err: ApiError, onRefresh?: () => unknown) {
  const title = err.code === 40902 ? '待办已被处理' : '申请状态已变化'
  const msg =
    err.code === 40902
      ? '该待办已被处理（可能已被他人处理、已转办或申请已撤回），请刷新后查看最新状态。'
      : '申请状态已变化（可能已被审批、驳回或撤回），请刷新后查看最新状态。'
  try {
    await ElMessageBox.alert(msg, title, { type: 'warning', confirmButtonText: '刷新' })
    await onRefresh?.()
  } catch {
    // 关闭弹窗时不刷新
  }
}

export function confirmDialog(c: ConfirmOptions): Promise<boolean> {
  return ElMessageBox.confirm(c.message, c.title ?? '确认操作', {
    type: c.type ?? 'warning',
    confirmButtonText: c.confirmText ?? '确定',
    cancelButtonText: c.cancelText ?? '取消',
    confirmButtonClass: c.danger ? 'el-button--danger' : undefined,
    distinguishCancelAndClose: false,
  }).then(
    () => true,
    () => false,
  )
}

export function useAction() {
  const loading = ref(false)

  async function run<T>(o: RunOptions<T>): Promise<T | undefined> {
    if (loading.value) return undefined
    // 键在确认框打开时生成：网络重试、重复点击都复用它
    const key = o.idemKey ?? newIdemKey()
    if (o.confirm && !(await confirmDialog(o.confirm))) return undefined
    loading.value = true
    try {
      for (;;) {
        try {
          const r = await o.action(key)
          if (o.success) ElMessage.success(typeof o.success === 'function' ? o.success(r) : o.success)
          return r
        } catch (e) {
          const err = toApiError(e)
          if (o.onError && (await o.onError(err))) return undefined
          if (isRetriable(err)) {
            const retry = await confirmDialog({
              title: err.code === 40903 ? '请求处理中' : '网络异常',
              message:
                err.code === 40903
                  ? '相同的请求正在处理中，请稍候再试。重试不会重复执行操作。'
                  : '请求未完成（网络异常或服务暂时不可用）。重试不会重复执行操作，是否重试？',
              confirmText: '重试',
              type: 'warning',
            })
            if (retry) continue
            return undefined
          }
          if (err.code === 40901 || err.code === 40902) {
            await conflictAlert(err, o.onConflict)
            return undefined
          }
          if (err.isConflict && err.code !== 40904) {
            ElMessage.error(err.message || ERROR_HINT[err.code] || '操作冲突')
            await o.onConflict?.()
            return undefined
          }
          showError(err)
          return undefined
        }
      }
    } finally {
      loading.value = false
    }
  }

  return { loading, run }
}
