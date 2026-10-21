import type { TaskStatus } from '@/lib/types'

export type DotTone = 'primary' | 'success' | 'danger' | 'warning' | 'muted'

/** 任务状态对应的圆点色调（docs/ui_design.md 第 2 节）；未知状态按灰点显示。 */
const TASK_DOT_TONE: Record<TaskStatus, DotTone> = {
  PENDING: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELED: 'muted',
  TRANSFERRED: 'warning',
}

export function taskDotTone(status: string): DotTone {
  return TASK_DOT_TONE[status as TaskStatus] ?? 'muted'
}

/** 全局 `.status-dot` 的类名：6px 圆点 + 文字 */
export function taskDotClass(status: string): string {
  return `status-dot status-dot--${taskDotTone(status)}`
}
