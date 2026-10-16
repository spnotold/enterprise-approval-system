<script setup lang="ts">
// 应用外壳：顶部栏（通知铃铛、用户菜单）+ 按权限过滤的侧边菜单
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElNotification } from 'element-plus'
import { ArrowDown, Expand, Fold } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { noticeTarget, useNoticeStore } from '@/stores/notice'
import { useSse } from '@/composables/useSse'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { activeMenuPath, visibleMenu } from '@/router/menu'
import { NOTIFICATION_TYPE_LABEL, ROLE_LABEL } from '@/lib/labels'
import NoticeBell from '@/components/NoticeBell.vue'
import PaperField from '@/components/PaperField.vue'

const auth = useAuthStore()
const notice = useNoticeStore()
const route = useRoute()
const router = useRouter()
const { isMobile } = useBreakpoint()

// 这些路由的参数变化时重新创建页面组件（不同申请 / 模板）
const KEYED_ROUTES = new Set(['application-detail', 'application-edit', 'apply-custom', 'admin-template-design'])

const collapsed = ref(false)
const drawer = ref(false)

const groups = computed(() => visibleMenu((p) => auth.can(p)))
const active = computed(() => activeMenuPath(route.path, groups.value))
const roleText = computed(() => (auth.me?.roles ?? []).map((r) => ROLE_LABEL[r.code] ?? r.name).join('、'))

watch(
  () => route.fullPath,
  () => (drawer.value = false),
)

// 实时通知：更新角标、弹出提醒；详情页根据 notice.lastAppEvent 自动刷新
useSse((e) => {
  notice.onEvent(e)
  const target = noticeTarget(e)
  const n = ElNotification({
    title: NOTIFICATION_TYPE_LABEL[e.type] ?? '新通知',
    message: e.title,
    type: e.type === 'APP_REJECTED' ? 'warning' : 'info',
    duration: 6000,
    customClass: target ? 'clickable-notification' : undefined,
    onClick: () => {
      n.close()
      void notice.markRead(e.id).catch(() => undefined)
      if (target) void router.push(target)
    },
  })
})

onBeforeUnmount(() => notice.reset())

function onCommand(cmd: string) {
  if (cmd === 'profile') void router.push('/profile')
  if (cmd === 'logout') void auth.logout()
}
</script>

<template>
  <el-container class="layout">
    <el-aside v-if="!isMobile" :width="collapsed ? '64px' : '216px'" class="aside">
      <div class="brand" :class="{ collapsed }">
        <span class="logo" aria-hidden="true">审</span>
        <span v-if="!collapsed" class="brand-text">企业审批系统</span>
      </div>
      <el-scrollbar>
        <el-menu :default-active="active" :collapse="collapsed" router class="menu">
          <template v-for="g in groups" :key="g.title ?? 'root'">
            <el-menu-item-group v-if="g.title && !collapsed" :title="g.title">
              <el-menu-item v-for="item in g.items" :key="item.path" :index="item.path">
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.title }}</span>
              </el-menu-item>
            </el-menu-item-group>
            <template v-else>
              <el-menu-item v-for="item in g.items" :key="item.path" :index="item.path">
                <el-icon><component :is="item.icon" /></el-icon>
                <template #title>{{ item.title }}</template>
              </el-menu-item>
            </template>
          </template>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-drawer v-else v-model="drawer" direction="ltr" size="240px" :with-header="false" class="nav-drawer">
      <div class="brand"><span class="logo" aria-hidden="true">审</span><span class="brand-text">企业审批系统</span></div>
      <el-menu :default-active="active" router class="menu">
        <template v-for="g in groups" :key="g.title ?? 'root'">
          <el-menu-item-group :title="g.title ?? undefined">
            <el-menu-item v-for="item in g.items" :key="item.path" :index="item.path">
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.title }}</span>
            </el-menu-item>
          </el-menu-item-group>
        </template>
      </el-menu>
    </el-drawer>

    <el-container class="main-wrap">
      <el-header class="header" :height="'52px'">
        <button
          class="icon-btn"
          type="button"
          :aria-label="isMobile ? '打开菜单' : collapsed ? '展开菜单' : '折叠菜单'"
          @click="isMobile ? (drawer = true) : (collapsed = !collapsed)"
        >
          <el-icon :size="20"><Fold v-if="!collapsed || isMobile" /><Expand v-else /></el-icon>
        </button>
        <span class="header-title">{{ route.meta.title }}</span>
        <div class="flex-1" />
        <NoticeBell />
        <el-dropdown trigger="click" @command="onCommand">
          <span class="user" role="button" tabindex="0" aria-label="用户菜单">
            <el-avatar :size="28" class="avatar">{{ auth.me?.realName?.slice(-2) }}</el-avatar>
            <span v-if="!isMobile" class="user-name">{{ auth.me?.realName }}</span>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <div class="user-card">
              <div class="user-card-name">{{ auth.me?.realName }}（{{ auth.me?.username }}）</div>
              <div class="muted small">{{ auth.me?.deptName ?? '未分配部门' }}</div>
              <div class="muted small">{{ roleText || '无角色' }}</div>
            </div>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">个人信息</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <PaperField class="layout-paper" />
      <el-main class="main">
        <router-view v-slot="{ Component, route: r }">
          <component :is="Component" :key="KEYED_ROUTES.has(String(r.name)) ? r.path : undefined" />
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}
.aside {
  display: flex;
  flex-direction: column;
  background: var(--eas-paper-deep);
  border-right: 1px solid var(--eas-rule);
  transition: width var(--eas-dur) var(--eas-ease);
  overflow: hidden;
}

/* 品牌：描边方块，像一枚印章边框 */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  flex: none;
  box-sizing: border-box;
  padding: 0 20px;
  font-size: var(--eas-fs-md);
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1px solid var(--eas-rule);
}
.brand.collapsed {
  justify-content: center;
  padding: 0;
}
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  border: 1.5px solid var(--eas-primary);
  border-radius: 3px;
  color: var(--eas-primary);
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-md);
  font-weight: 600;
  line-height: 1;
  flex: none;
}

/* 侧边菜单：夹板底色，选中项白底 + 左侧 3px 主色竖线 */
.menu {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--eas-ink);
  --el-menu-hover-bg-color: var(--eas-paper);
  --el-menu-active-color: var(--eas-ink);
  --el-menu-item-height: 40px;
  --el-menu-base-level-padding: 20px;
  border-right: none;
  padding-bottom: 12px;
}
.menu.el-menu--collapse {
  width: 100%;
}
.menu :deep(.el-menu-item-group__title) {
  padding: 16px 20px 6px;
  font-size: var(--eas-fs-xs);
  line-height: 1.4;
  color: var(--eas-ink-2);
}
.menu :deep(.el-menu-item-group__title:empty) {
  display: none;
}
.menu :deep(.el-menu-item) {
  position: relative;
  height: 40px;
  line-height: 40px;
  font-size: var(--eas-fs-sm);
}
.menu :deep(.el-menu-item .el-icon) {
  color: var(--eas-ink-2);
}
.menu :deep(.el-menu-item.is-active),
.menu :deep(.el-menu-item.is-active:hover) {
  background: var(--eas-surface);
  font-weight: 600;
}
.menu :deep(.el-menu-item.is-active .el-icon) {
  color: var(--eas-primary);
}
.menu :deep(.el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--eas-primary);
}
.menu :deep(.el-menu-item:focus-visible) {
  outline-offset: -2px;
}

.main-wrap {
  position: relative;
  min-width: 0;
}
.layout-paper {
  position: absolute;
  top: 52px;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: calc(100% - 52px);
  pointer-events: none;
  z-index: 0;
}
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--eas-surface);
  border-bottom: 1px solid var(--eas-rule);
}
.header-title {
  margin-left: 4px;
  font-weight: 600;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: var(--eas-radius-control);
  background: transparent;
  cursor: pointer;
  color: var(--eas-ink);
  transition: background var(--eas-dur-fast) var(--eas-ease);
}
.icon-btn:hover {
  background: var(--eas-paper);
}
.user {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--eas-radius-control);
  cursor: pointer;
  transition: background var(--eas-dur-fast) var(--eas-ease);
}
.user:hover {
  background: var(--eas-paper);
}
.avatar {
  background: var(--eas-primary-tint);
  color: var(--eas-primary);
  font-size: var(--eas-fs-xs);
  font-weight: 600;
}
.user-card {
  padding: 10px 16px 6px;
  min-width: 180px;
  border-bottom: 1px solid var(--eas-rule);
}
.user-card-name {
  font-weight: 600;
  margin-bottom: 2px;
}
.main {
  position: relative;
  z-index: 1;
  --el-main-padding: 24px;
  background: transparent;
  overflow-y: auto;
}
@media (max-width: 768px) {
  .main {
    --el-main-padding: 12px;
  }
}
</style>

<style>
.clickable-notification {
  cursor: pointer;
}
.nav-drawer.el-drawer {
  background: var(--eas-paper-deep);
}
.nav-drawer .el-drawer__body {
  padding: 0;
}
</style>
