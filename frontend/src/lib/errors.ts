// 统一的错误展示：顶部红色提示服务端 message；500 弹窗显示 traceId
import { h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, toApiError } from './http'

/** 常见错误码的默认文案（服务端 message 为空时使用） */
export const ERROR_HINT: Record<number, string> = {
  40000: '参数格式错误',
  40001: '缺少必要的请求头',
  40101: '请先登录',
  40102: '登录已过期，请重新登录',
  40103: '用户名或密码错误',
  40104: '账号待管理员审核，审核通过后即可登录',
  40105: '账号已停用或已被锁定，请稍后再试或联系管理员',
  40301: '没有该操作的权限',
  40302: '您不是当前审批人',
  40303: '不能审批自己的申请',
  40401: '无权查看或已不存在',
  40901: '申请状态已变化',
  40902: '待办已被处理',
  40903: '相同请求正在处理中，请稍候',
  40904: '请求内容已变化，请重新操作',
  40905: '草稿已在别处修改',
  40906: '模板已更新',
  41301: '文件过大，单个文件不超过 10 MB',
  41501: '文件类型不允许，仅支持 JPEG、PNG、PDF',
  42201: '业务规则校验失败',
  42901: '请求过于频繁，请稍后再试',
  50000: '服务器错误',
}

export function errorText(e: unknown, fallback = '操作失败'): string {
  const err = toApiError(e)
  return err.message || ERROR_HINT[err.code] || fallback
}

export function isServerError(err: ApiError): boolean {
  return err.code === 50000 || (err.httpStatus !== null && err.httpStatus >= 500)
}

/** 500：弹窗显示 traceId，便于对照后端日志排查 */
export function showServerError(err: ApiError) {
  return ElMessageBox.alert(
    h('div', [
      h('p', { style: 'margin:0 0 8px' }, err.message || ERROR_HINT[50000]),
      h('p', { style: 'margin:0;color:var(--el-text-color-secondary);font-size:12px' }, [
        '追踪号（traceId）：',
        h('code', { style: 'user-select:all' }, err.traceId ?? '无'),
      ]),
    ]),
    '服务器错误',
    { type: 'error', confirmButtonText: '知道了' },
  ).catch(() => undefined)
}

/** 通用错误提示；返回规范化后的 ApiError */
export function showError(e: unknown, fallback?: string): ApiError {
  const err = toApiError(e)
  if (isServerError(err)) {
    void showServerError(err)
    return err
  }
  ElMessage.error(errorText(err, fallback))
  return err
}

/** ElMessageBox 被取消 / 关闭时 reject 的值 */
export function isDialogCancel(e: unknown): boolean {
  return e === 'cancel' || e === 'close'
}

export { ApiError, toApiError }
