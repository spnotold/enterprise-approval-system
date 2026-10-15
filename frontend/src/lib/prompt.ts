// 需要填写原因的操作（管理端写操作、驳回等）：弹窗输入，返回去除首尾空白的原因；取消返回 null
import { ElMessageBox } from 'element-plus'

export interface ReasonPromptOptions {
  title: string
  message?: string
  placeholder?: string
  minLength?: number
  maxLength?: number
  confirmText?: string
  /** 危险操作：确认按钮为红色 */
  danger?: boolean
  initial?: string
}

export async function promptReason(o: ReasonPromptOptions): Promise<string | null> {
  const min = o.minLength ?? 1
  const max = o.maxLength ?? 500
  try {
    const r = (await ElMessageBox.prompt(o.message ?? '请填写原因（将写入审计日志）', o.title, {
      inputType: 'textarea',
      inputPlaceholder: o.placeholder ?? `原因（${min > 1 ? `${min}-` : '不超过 '}${max} 字）`,
      inputValue: o.initial ?? '',
      confirmButtonText: o.confirmText ?? '确定',
      cancelButtonText: '取消',
      confirmButtonClass: o.danger ? 'el-button--danger' : undefined,
      type: o.danger ? 'warning' : undefined,
      inputValidator: (v: string) => {
        const len = [...(v ?? '').trim()].length
        if (len < min) return min > 1 ? `请至少填写 ${min} 个字` : '请填写原因'
        if (len > max) return `不能超过 ${max} 字`
        return true
      },
    })) as { value: string }
    return r.value.trim()
  } catch {
    return null
  }
}
