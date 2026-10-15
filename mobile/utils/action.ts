// 状态流转类操作（提交、撤回、催办、批准、驳回）的公共流程：
// 幂等键在用户打开确认框时生成；网络异常或“相同请求处理中”时询问重试，重试复用同一个键。
import { toApiError } from '@/lib/http'
import { confirm, hideLoading, loading } from './feedback'

/**
 * 执行带幂等键的请求。业务失败时抛出 ApiError；用户放弃重试时返回 null。
 */
export async function runIdempotent<T>(
  idemKey: string,
  call: (key: string) => Promise<T>,
  loadingText = '处理中',
): Promise<T | null> {
  for (;;) {
    loading(loadingText)
    try {
      const r = await call(idemKey)
      hideLoading()
      return r
    } catch (err) {
      hideLoading()
      const e = toApiError(err)
      if (e.isNetwork || e.code === 40903) {
        const again = await confirm({
          title: '操作未完成',
          content: e.code === 40903 ? '相同请求仍在处理中，是否稍后重试？' : '网络异常，是否重试？重试不会重复执行。',
          confirmText: '重试',
        })
        if (again) continue
        return null
      }
      throw e
    }
  }
}
