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
        <span class="logo">审</span>
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

    <el-drawer v-else v-model="drawer" direction="ltr" size="240px" :with-header="false">
      <div class="brand"><span class="logo">审</span><span class="brand-text">企业审批系统</span></div>
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
      <el-header class="header" :height="'56px'">
        <button
          class="icon-btn"
          type="button"
          :aria-label="isMobile ? '打开菜单' : '折叠菜单'"
          @click="isMobile ? (drawer = true) : (collapsed = !collapsed)"
        >
          <el-icon :size="20"><Fold v-if="!collapsed || isMobile" /><Expand v-else /></el-icon>
        </button>
        <span class="header-title">{{ route.meta.title }}</span>
        <div class="flex-1" />
        <NoticeBell />
        <el-dropdown trigger="click" @command="onCommand">
          <span class="user">
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
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
  transition: width 0.2s;
  overflow: hidden;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  padding: 0 16px;
  font-weight: 600;
  font-size: 16px;
  white-space: nowrap;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.brand.collapsed {
  justify-content: center;
  padding: 0;
}
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 15px;
  flex: none;
}
.menu {
  border-right: none;
}
.menu :deep(.el-menu-item-group__title) {
  padding-top: 12px;
}
.main-wrap {
  min-width: 0;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.header-title {
  font-weight: 500;
}
.icon-btn {
  display: inline-flex;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
}
.user {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  outline: none;
}
.avatar {
  background: var(--el-color-primary-light-3);
  font-size: 12px;
}
.user-card {
  padding: 10px 16px 6px;
  min-width: 180px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.user-card-name {
  font-weight: 600;
  margin-bottom: 2px;
}
.main {
  background: var(--el-bg-color-page);
  overflow-y: auto;
}
@media (max-width: 768px) {
  .main {
    padding: 12px;
  }
}
</style>

<style>
.clickable-notification {
  cursor: pointer;
}
</style>
