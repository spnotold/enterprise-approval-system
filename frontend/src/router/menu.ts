// 导航项按 me.permissions 过滤（只影响显示，权限以后端为准）
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

export interface MenuSection {
  id: string
  label: string
  items: MenuItem[]
}

export interface AdminMenuGroup {
  id: string
  label: string
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

const SECTION_DEFINITIONS: MenuSection[] = [
  { id: 'workbench', label: '工作台', items: MENU[0].items },
  { id: 'application', label: '申请', items: MENU[1].items },
  { id: 'approval', label: '审批', items: MENU[2].items },
  { id: 'stats', label: '统计', items: MENU[3].items.filter((item) => item.path === '/stats') },
  { id: 'admin', label: '管理', items: MENU[4].items },
]

/** 管理栏目的竖向索引分段，顺序与设计规范一致。 */
export const ADMIN_GROUPS = [
  { id: 'people', label: '人员', paths: ['/admin/registrations', '/admin/users', '/admin/departments', '/admin/roles', '/admin/grants'] },
  { id: 'process', label: '流程', paths: ['/admin/templates', '/admin/expense-types', '/admin/tasks'] },
  { id: 'system', label: '系统', paths: ['/admin/config', '/admin/audit-logs', '/admin/deliveries'] },
] as const

function canSee(item: MenuItem, can: (perm: string) => boolean): boolean {
  return (!item.perm || can(item.perm)) && (!item.anyPerm || item.anyPerm.some(can))
}

/** 已过滤的管理项分段；空段不显示，且不重新进行权限判断。 */
export function adminMenuGroups(items: readonly MenuItem[]): AdminMenuGroup[] {
  const byPath = new Map(items.map((item) => [item.path, item]))
  return ADMIN_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.paths.flatMap((path) => {
      const item = byPath.get(path)
      return item ? [item] : []
    }),
  })).filter((group) => group.items.length > 0)
}

/** 顶栏栏目；通知中心从铃铛进入，不占栏目。 */
export function visibleSections(can: (perm: string) => boolean): MenuSection[] {
  return SECTION_DEFINITIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canSee(item, can)),
  })).filter((section) => section.items.length > 0)
}

export function visibleMenu(can: (perm: string) => boolean): MenuGroup[] {
  return MENU.map((g) => ({
    ...g,
    items: g.items.filter((i) => canSee(i, can)),
  })).filter((g) => g.items.length > 0)
}

const APPLICATION_DETAIL = /^\/applications\/\d+(?:\/edit)?$/
const APPLY_FORM = /^\/apply\/(?:purchase|travel|expense|custom\/\d+)$/
const TEMPLATE_DESIGN = /^\/admin\/templates\/\d+\/design$/

/** 当前栏目 id。详情和编辑页可用来源栏目 id 或可见列表路径恢复上下文。 */
export function activeSection(path: string, sections: readonly MenuSection[], fromHint?: string): string {
  const itemSection = sections.find((section) => section.items.some((item) => item.path === path))
  if (itemSection) return itemSection.id

  if (APPLY_FORM.test(path)) {
    return sections.find((section) => section.id === 'application' && section.items.some((item) => item.path === '/apply'))?.id ?? ''
  }
  if (TEMPLATE_DESIGN.test(path)) {
    return sections.find((section) => section.id === 'admin' && section.items.some((item) => item.path === '/admin/templates'))?.id ?? ''
  }
  if (!APPLICATION_DETAIL.test(path)) return ''

  const contextSections = sections.filter((section) => section.id === 'application' || section.id === 'approval')
  const hinted = contextSections.find(
    (section) => section.id === fromHint || section.items.some((item) => item.path === fromHint),
  )
  return hinted?.id ?? contextSections.find((section) => section.id === 'application')?.id ??
    contextSections.find((section) => section.id === 'approval')?.id ?? ''
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

