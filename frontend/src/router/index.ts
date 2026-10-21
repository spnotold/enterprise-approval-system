import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getScrollBehavior } from './scrollBehavior'

declare module 'vue-router' {
  interface RouteMeta {
    /** 无需登录 */
    public?: boolean
    /** 需要的功能权限点（me.permissions） */
    perm?: string
    /** 页面标题 */
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true, title: '登录' } },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/Register.vue'),
    meta: { public: true, title: '注册' },
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    children: [
      { path: '', name: 'workbench', component: () => import('@/views/Workbench.vue'), meta: { title: '工作台' } },

      // 发起申请
      {
        path: 'apply',
        name: 'apply',
        component: () => import('@/views/apply/ApplyHome.vue'),
        meta: { perm: 'APP_CREATE', title: '发起申请' },
      },
      {
        path: 'apply/purchase',
        name: 'apply-purchase',
        component: () => import('@/views/apply/PurchaseForm.vue'),
        meta: { perm: 'APP_CREATE', title: '采购申请' },
      },
      {
        path: 'apply/travel',
        name: 'apply-travel',
        component: () => import('@/views/apply/TravelForm.vue'),
        meta: { perm: 'APP_CREATE', title: '差旅申请' },
      },
      {
        path: 'apply/expense',
        name: 'apply-expense',
        component: () => import('@/views/apply/ExpenseForm.vue'),
        meta: { perm: 'APP_CREATE', title: '报销申请' },
      },
      {
        path: 'apply/custom/:templateId(\\d+)',
        name: 'apply-custom',
        component: () => import('@/views/apply/CustomForm.vue'),
        props: (r) => ({ templateId: Number(r.params.templateId) }),
        meta: { perm: 'APP_CREATE', title: '自定义申请' },
      },

      // 申请
      {
        path: 'applications/mine',
        name: 'my-applications',
        component: () => import('@/views/applications/ApplicationList.vue'),
        props: { scope: 'mine' },
        meta: { perm: 'APP_CREATE', title: '我的申请' },
      },
      {
        path: 'applications/granted',
        name: 'granted-applications',
        component: () => import('@/views/applications/ApplicationList.vue'),
        props: { scope: 'granted' },
        meta: { perm: 'APP_READ_GRANTED', title: '授权范围申请' },
      },
      {
        path: 'dept/applications',
        name: 'dept-applications',
        component: () => import('@/views/applications/ApplicationList.vue'),
        props: { scope: 'dept' },
        meta: { perm: 'APP_READ_DEPT', title: '本部门申请' },
      },
      {
        path: 'applications/:id(\\d+)',
        name: 'application-detail',
        component: () => import('@/views/applications/ApplicationDetail.vue'),
        props: (r) => ({ id: Number(r.params.id) }),
        meta: { title: '申请详情' },
      },
      {
        path: 'applications/:id(\\d+)/edit',
        name: 'application-edit',
        component: () => import('@/views/apply/ApplicationEdit.vue'),
        props: (r) => ({ id: Number(r.params.id) }),
        meta: { perm: 'APP_CREATE', title: '编辑草稿' },
      },

      // 待办
      {
        path: 'tasks/pending',
        name: 'tasks-pending',
        component: () => import('@/views/tasks/TaskList.vue'),
        props: { kind: 'pending' },
        meta: { perm: 'TASK_HANDLE', title: '我的待办' },
      },
      {
        path: 'tasks/done',
        name: 'tasks-done',
        component: () => import('@/views/tasks/TaskList.vue'),
        props: { kind: 'done' },
        meta: { perm: 'TASK_HANDLE', title: '我的已办' },
      },

      { path: 'stats', name: 'stats', component: () => import('@/views/Stats.vue'), meta: { title: '统计' } },
      {
        path: 'notifications',
        name: 'notifications',
        component: () => import('@/views/Notifications.vue'),
        meta: { title: '通知中心' },
      },
      { path: 'profile', name: 'profile', component: () => import('@/views/Profile.vue'), meta: { title: '个人信息' } },
      { path: '403', name: 'forbidden', component: () => import('@/views/Forbidden.vue'), meta: { title: '无权访问' } },

      // 管理端
      {
        path: 'admin/users',
        name: 'admin-users',
        component: () => import('@/views/admin/Users.vue'),
        meta: { perm: 'ADMIN_USER', title: '用户管理' },
      },
      {
        path: 'admin/registrations',
        name: 'admin-registrations',
        component: () => import('@/views/admin/Registrations.vue'),
        meta: { perm: 'ADMIN_USER', title: '注册审核' },
      },
      {
        path: 'admin/departments',
        name: 'admin-departments',
        component: () => import('@/views/admin/Departments.vue'),
        meta: { perm: 'ADMIN_DEPT', title: '部门管理' },
      },
      {
        path: 'admin/roles',
        name: 'admin-roles',
        component: () => import('@/views/admin/Roles.vue'),
        meta: { perm: 'ADMIN_USER', title: '角色与权限' },
      },
      {
        path: 'admin/grants',
        name: 'admin-grants',
        component: () => import('@/views/admin/Grants.vue'),
        meta: { perm: 'ADMIN_GRANT', title: '授权管理' },
      },
      {
        path: 'admin/templates',
        name: 'admin-templates',
        component: () => import('@/views/admin/Templates.vue'),
        meta: { perm: 'ADMIN_TEMPLATE', title: '流程模板' },
      },
      {
        path: 'admin/templates/:id(\\d+)/design',
        name: 'admin-template-design',
        component: () => import('@/views/admin/TemplateDesign.vue'),
        props: (r) => ({ id: Number(r.params.id) }),
        meta: { perm: 'ADMIN_TEMPLATE', title: '流程设计' },
      },
      {
        path: 'admin/expense-types',
        name: 'admin-expense-types',
        component: () => import('@/views/admin/ExpenseTypes.vue'),
        meta: { perm: 'ADMIN_CONFIG', title: '费用类型' },
      },
      {
        path: 'admin/config',
        name: 'admin-config',
        component: () => import('@/views/admin/SysConfig.vue'),
        meta: { perm: 'ADMIN_CONFIG', title: '系统配置' },
      },
      {
        path: 'admin/tasks',
        name: 'admin-tasks',
        component: () => import('@/views/admin/TaskMonitor.vue'),
        meta: { perm: 'ADMIN_TRANSFER', title: '待办监控' },
      },
      {
        path: 'admin/audit-logs',
        name: 'admin-audit-logs',
        component: () => import('@/views/admin/AuditLogs.vue'),
        meta: { perm: 'ADMIN_AUDIT', title: '审计日志' },
      },
      {
        path: 'admin/deliveries',
        name: 'admin-deliveries',
        component: () => import('@/views/admin/Deliveries.vue'),
        meta: { perm: 'ADMIN_CONFIG', title: '邮件投递' },
      },

      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/NotFound.vue'),
        meta: { title: '页面不存在' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: getScrollBehavior,
})

let bootstrapped = false

// 守卫只负责体验：未登录跳转登录页、无权限显示 403；权限以后端为准
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!bootstrapped) {
    bootstrapped = true
    // 首次进入：有令牌则拉取用户信息，没有则尝试用 Cookie 中的刷新令牌静默登录
    await auth.bootstrap()
  }
  if (to.meta.public) {
    if (auth.isLoggedIn && auth.me && (to.name === 'login' || to.name === 'register')) return { path: '/' }
    return true
  }
  if (auth.isLoggedIn && !auth.me) {
    try {
      await auth.reloadMe()
    } catch {
      auth.clearLocal()
    }
  }
  if (!auth.isLoggedIn || !auth.me) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.perm && !auth.can(to.meta.perm)) return { name: 'forbidden' }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 企业审批系统` : '企业审批系统'
})

export default router
