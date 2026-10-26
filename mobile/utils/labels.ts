import type {
  AppAction,
  AppStatus,
  AppType,
  LogAction,
  NodeMode,
  NodeStatus,
  NotificationType,
  PurchaseQuoteInput,
  TaskStatus,
  TravelSaveRequest,
} from '@/lib/types'

export const APP_TYPE_LABEL: Record<AppType, string> = {
  PURCHASE: '采购',
  TRAVEL: '差旅',
  EXPENSE: '报销',
  CUSTOM: '自定义',
}

export const APP_STATUS_LABEL: Record<AppStatus, string> = {
  DRAFT: '草稿',
  IN_APPROVAL: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  WITHDRAWN: '已撤回',
}

export const APP_STATUS_ORDER: AppStatus[] = ['DRAFT', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN']

/** 状态颜色（套色）：草稿暗纸、审批中天青、已通过鼠尾草、已驳回铁锈、已撤回灰 */
export const APP_STATUS_COLOR: Record<AppStatus, string> = {
  DRAFT: '#efe5cf',
  IN_APPROVAL: '#b3cbd5',
  APPROVED: '#a3b590',
  REJECTED: '#a94a2c',
  WITHDRAWN: '#7d8389',
}

export const NODE_STATUS_LABEL: Record<NodeStatus, string> = {
  WAITING: '待审批',
  ACTIVE: '审批中',
  APPROVED: '已同意',
  REJECTED: '已驳回',
  CANCELED: '已取消',
  SKIPPED: '已跳过',
  NOT_REACHED: '未到达',
}

export const NODE_STATUS_COLOR: Record<NodeStatus, string> = {
  WAITING: '#c0c4cc',
  ACTIVE: '#2f6bff',
  APPROVED: '#16a34a',
  REJECTED: '#e5484d',
  CANCELED: '#8f959e',
  SKIPPED: '#c0c4cc',
  NOT_REACHED: '#c0c4cc',
}

export const NODE_MODE_LABEL: Record<NodeMode, string> = {
  SINGLE: '',
  COUNTERSIGN: '会签',
  OR_SIGN: '或签',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: '待处理',
  APPROVED: '已同意',
  REJECTED: '已驳回',
  CANCELED: '已取消',
  TRANSFERRED: '已转办',
}

export const LOG_ACTION_LABEL: Record<LogAction, string> = {
  SUBMIT: '提交',
  APPROVE: '同意',
  REJECT: '驳回',
  WITHDRAW: '撤回',
  TRANSFER: '转办',
}

export const ACTION_LABEL: Record<AppAction, string> = {
  EDIT: '编辑',
  DELETE: '删除',
  SUBMIT: '提交',
  WITHDRAW: '撤回',
  COPY: '复制并修改',
  APPROVE: '同意',
  REJECT: '驳回',
  URGE: '催办',
}

export const NOTICE_TYPE_LABEL: Record<NotificationType, string> = {
  TASK_ASSIGNED: '新待办',
  NODE_APPROVED: '节点通过',
  APP_APPROVED: '审批通过',
  APP_REJECTED: '被驳回',
  TASK_CANCELED: '待办取消',
  TASK_TRANSFERRED: '转办',
  REGISTRATION_APPROVED: '注册通过',
  URGE: '催办',
  TASK_OVERDUE: '待办超时',
}

type Transport = NonNullable<TravelSaveRequest['transport']>
export const TRANSPORT_OPTIONS: { value: Transport; label: string }[] = [
  { value: 'PLANE', label: '飞机' },
  { value: 'TRAIN', label: '火车' },
  { value: 'BUS', label: '汽车' },
  { value: 'CAR', label: '自驾' },
  { value: 'OTHER', label: '其他' },
]

export function transportLabel(v: string | null | undefined): string {
  return TRANSPORT_OPTIONS.find((o) => o.value === v)?.label ?? '—'
}

export const CHANNEL_LABEL: Record<PurchaseQuoteInput['channel'], string> = {
  ONLINE: '线上',
  OFFLINE: '线下',
}

export const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: '员工',
  DEPT_HEAD: '部门负责人',
  FINANCE_APPROVER: '财务审批人',
  ENTERPRISE_HEAD: '企业负责人',
  SYS_ADMIN: '系统管理员',
}

/** 发起页、编辑草稿时按业务类型找到对应的表单页面 */
export function formPagePath(type: AppType): string {
  switch (type) {
    case 'PURCHASE':
      return '/pages/apply/purchase'
    case 'TRAVEL':
      return '/pages/apply/travel'
    case 'EXPENSE':
      return '/pages/apply/expense'
    default:
      return '/pages/apply/custom'
  }
}

export function textOr(v: string | null | undefined, fallback = '—'): string {
  return v === null || v === undefined || v === '' ? fallback : v
}
