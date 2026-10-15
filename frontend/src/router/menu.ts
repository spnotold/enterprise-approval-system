// 侧边菜单：按 me.permissions 过滤（只影响显示，权限以后端为准）
import type { Component } from 'vue'
import {
  Bell,
  Checked,
  Coin,
  DataAnalysis,
  Document,
  DocumentAdd,
  EditPen,
  Files,
  HomeFilled,
  Key,
  List,
  Message,
  OfficeBuilding,
  Operation,
  Setting,
  Tickets,
  User,
  UserFilled,
  View,
} from '@element-plus/icons-vue'

export interface MenuItem {
  path: string
  title: string
  icon: Component
  perm?: string
  /** 任一权限即可显示 */
  anyPerm?: string[]
}

export interface MenuGroup {
  title: string | null
  items: MenuItem[]
}

export const MENU: MenuGroup[] = [
  {
    title: null,
    items: [{ path: '/', title: '工作台', icon: HomeFilled }],
  },
  {
    title: '申请',
    items: [
      { path: '/apply', title: '发起申请', icon: DocumentAdd, perm: 'APP_CREATE' },
      { path: '/applications/mine', title: '我的申请', icon: Document, perm: 'APP_CREATE' },
    ],
  },
  {
    title: '审批',
    items: [
      { path: '/tasks/pending', title: '我的待办', icon: EditPen, perm: 'TASK_HANDLE' },
      { path: '/tasks/done', title: '我的已办', icon: Checked, perm: 'TASK_HANDLE' },
      { path: '/dept/applications', title: '本部门申请', icon: OfficeBuilding, perm: 'APP_READ_DEPT' },
      { path: '/applications/granted', title: '授权范围申请', icon: View, perm: 'APP_READ_GRANTED' },
    ],
  },
  {
    title: '统计与消息',
    items: [
      { path: '/stats', title: '统计', icon: DataAnalysis },
      { path: '/notifications', title: '通知中心', icon: Bell },
    ],
  },
  {
    title: '系统管理',
    items: [
      { path: '/admin/registrations', title: '注册审核', icon: UserFilled, perm: 'ADMIN_USER' },
      { path: '/admin/users', title: '用户管理', icon: User, perm: 'ADMIN_USER' },
      { path: '/admin/departments', title: '部门管理', icon: OfficeBuilding, perm: 'ADMIN_DEPT' },
      { path: '/admin/roles', title: '角色与权限', icon: Key, perm: 'ADMIN_USER' },
      { path: '/admin/grants', title: '授权管理', icon: Tickets, perm: 'ADMIN_GRANT' },
      { path: '/admin/templates', title: '流程模板', icon: Files, perm: 'ADMIN_TEMPLATE' },
      { path: '/admin/expense-types', title: '费用类型', icon: Coin, perm: 'ADMIN_CONFIG' },
      { path: '/admin/config', title: '系统配置', icon: Setting, perm: 'ADMIN_CONFIG' },
      { path: '/admin/tasks', title: '待办监控', icon: Operation, perm: 'ADMIN_TRANSFER' },
      { path: '/admin/audit-logs', title: '审计日志', icon: List, perm: 'ADMIN_AUDIT' },
      { path: '/admin/deliveries', title: '邮件投递', icon: Message, perm: 'ADMIN_CONFIG' },
    ],
  },
]

export function visibleMenu(can: (perm: string) => boolean): MenuGroup[] {
  return MENU.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.perm || can(i.perm)) && (!i.anyPerm || i.anyPerm.some(can))),
  })).filter((g) => g.items.length > 0)
}

/** 当前路由对应的菜单项（最长前缀匹配），用于高亮 */
export function activeMenuPath(path: string, groups: MenuGroup[]): string {
  let best = path === '/' ? '/' : ''
  for (const g of groups) {
    for (const i of g.items) {
      if (i.path === '/') continue
      if ((path === i.path || path.startsWith(`${i.path}/`)) && i.path.length > best.length) best = i.path
    }
  }
  return best
}

