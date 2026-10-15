// 枚举值的中文显示名
import type {
  AppAction,
  AppStatus,
  AppType,
  ApproverRuleType,
  ConditionOp,
  DeliveryView,
  FieldType,
  GrantPermission,
  LogAction,
  NodeMode,
  NodeStatus,
  NotificationType,
  RoleCode,
  ScopeType,
  TaskStatus,
  TravelSaveRequest,
  UserStatus,
} from './types'
import type { TypePath } from './api/applications'

export const APP_TYPE_LABEL: Record<AppType, string> = {
  PURCHASE: '采购申请',
  TRAVEL: '差旅申请',
  EXPENSE: '报销申请',
  CUSTOM: '自定义申请',
}

export const APP_TYPE_PATH: Record<AppType, TypePath> = {
  PURCHASE: 'purchase',
  TRAVEL: 'travel',
  EXPENSE: 'expense',
  CUSTOM: 'custom',
}

export const APP_STATUS_LABEL: Record<AppStatus, string> = {
  DRAFT: '草稿',
  IN_APPROVAL: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  WITHDRAWN: '已撤回',
}

export const NODE_STATUS_LABEL: Record<NodeStatus, string> = {
  WAITING: '未开始',
  ACTIVE: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  CANCELED: '已取消',
  SKIPPED: '已跳过',
  NOT_REACHED: '未到达',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: '待处理',
  APPROVED: '已批准',
  REJECTED: '已驳回',
  CANCELED: '已取消',
  TRANSFERRED: '已转办',
}

export const TASK_STATUS_TAG: Record<TaskStatus, 'primary' | 'success' | 'danger' | 'info' | 'warning'> = {
  PENDING: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELED: 'info',
  TRANSFERRED: 'warning',
}

export const LOG_ACTION_LABEL: Record<LogAction, string> = {
  SUBMIT: '提交',
  APPROVE: '批准',
  REJECT: '驳回',
  WITHDRAW: '撤回',
  TRANSFER: '转办',
}

export const APP_ACTION_LABEL: Record<AppAction, string> = {
  EDIT: '编辑',
  DELETE: '删除',
  SUBMIT: '提交',
  WITHDRAW: '撤回',
  COPY: '复制并修改',
  APPROVE: '批准',
  REJECT: '驳回',
  URGE: '催办',
}

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  TASK_ASSIGNED: '新待办',
  NODE_APPROVED: '节点通过',
  APP_APPROVED: '审批通过',
  APP_REJECTED: '已驳回',
  TASK_CANCELED: '待办取消',
  TASK_TRANSFERRED: '转办',
  REGISTRATION_APPROVED: '注册通过',
  URGE: '催办',
  TASK_OVERDUE: '超时提醒',
}

export const ROLE_LABEL: Record<RoleCode, string> = {
  EMPLOYEE: '员工',
  DEPT_HEAD: '部门负责人',
  FINANCE_APPROVER: '财务审批人',
  ENTERPRISE_HEAD: '企业负责人',
  SYS_ADMIN: '系统管理员',
}

export const ROLE_CODES: RoleCode[] = ['EMPLOYEE', 'DEPT_HEAD', 'FINANCE_APPROVER', 'ENTERPRISE_HEAD', 'SYS_ADMIN']

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  PENDING: '待审核',
  ACTIVE: '正常',
  DISABLED: '已停用',
  REJECTED: '已拒绝',
}

export const USER_STATUS_TAG: Record<UserStatus, 'primary' | 'success' | 'danger' | 'info' | 'warning'> = {
  PENDING: 'warning',
  ACTIVE: 'success',
  DISABLED: 'info',
  REJECTED: 'danger',
}

export const GRANT_PERMISSION_LABEL: Record<GrantPermission, string> = {
  APP_READ: '申请查看（APP_READ）',
  FIN_STATS_READ: '财务统计（FIN_STATS_READ）',
  BIZ_CONTENT_READ: '业务正文查看（BIZ_CONTENT_READ）',
}

export const SCOPE_TYPE_LABEL: Record<ScopeType, string> = {
  DEPT: '指定部门',
  ALL: '全部部门',
}

export type Transport = NonNullable<TravelSaveRequest['transport']>
export const TRANSPORT_LABEL: Record<Transport, string> = {
  PLANE: '飞机',
  TRAIN: '火车 / 高铁',
  BUS: '大巴',
  CAR: '自驾 / 汽车',
  OTHER: '其他',
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  TEXT: '单行文本',
  TEXTAREA: '多行文本',
  NUMBER: '数字',
  AMOUNT: '金额',
  DATE: '日期',
  RADIO: '单选',
  ATTACHMENT: '附件',
}

export const APPROVER_RULE_LABEL: Record<ApproverRuleType, string> = {
  SPECIFIED_USER: '指定用户',
  APPLICANT_DEPT_HEAD: '申请人部门负责人',
  ROLE: '角色主办人',
}

export const NODE_MODE_LABEL: Record<NodeMode, string> = {
  SINGLE: '单人审批',
  COUNTERSIGN: '会签（全部同意）',
  OR_SIGN: '或签（任一人处理）',
}

export const CONDITION_OP_LABEL: Record<ConditionOp, string> = {
  EQ: '等于',
  NE: '不等于',
  GT: '大于',
  GTE: '大于等于',
  LT: '小于',
  LTE: '小于等于',
  IN: '属于',
}

export const DELIVERY_STATUS_LABEL: Record<DeliveryView['status'], string> = {
  PENDING: '待发送 / 重试中',
  SENT: '已发送',
  FAILED: '失败',
  SKIPPED: '已跳过',
}

export const PERMISSION_LABEL: Record<string, string> = {
  APP_CREATE: '发起申请',
  TASK_HANDLE: '处理待办',
  APP_READ_DEPT: '本部门申请查看',
  STATS_DEPT: '本部门统计',
  FIN_STATS: '财务统计',
  ENTERPRISE_STATS: '企业统计',
  APP_READ_GRANTED: '授权范围查询',
  ADMIN_USER: '用户管理',
  ADMIN_DEPT: '部门管理',
  ADMIN_GRANT: '授权管理',
  ADMIN_TEMPLATE: '模板管理',
  ADMIN_CONFIG: '系统配置',
  ADMIN_AUDIT: '审计日志',
  ADMIN_TRANSFER: '待办转办',
}

/** 枚举转 el-select 选项 */
export function toOptions<K extends string>(labels: Record<K, string>): { value: K; label: string }[] {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }))
}
