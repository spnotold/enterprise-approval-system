<script setup lang="ts">
// 案卷外壳：顶栏栏目、案卷页签、管理索引和铺满桌面的格纸。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElNotification } from 'element-plus'
import { ArrowDown, Menu as MenuIcon } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { noticeTarget, useNoticeStore } from '@/stores/notice'
import { useSse } from '@/composables/useSse'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { activeMenuPath, activeSection, visibleSections } from '@/router/menu'
import { detailSectionHint } from '@/router/sectionContext'
import { NOTIFICATION_TYPE_LABEL, ROLE_LABEL } from '@/lib/labels'
import AdminIndex from '@/components/AdminIndex.vue'
import NoticeBell from '@/components/NoticeBell.vue'
import PaperField from '@/components/PaperField.vue'
import SectionTabs from '@/components/SectionTabs.vue'

const auth = useAuthStore()
const notice = useNoticeStore()
const route = useRoute()
const router = useRouter()
const { isMobile } = useBreakpoint('(max-width: 767px)')
const KEYED_ROUTES = new Set(['application-detail', 'application-edit', 'apply-custom', 'admin-template-design'])
const drawer = ref(false)
const desk = ref<HTMLElement | null>(null)
const pendingCount = ref(0)
const detailOrigin = ref<string>()
const sections = computed(() => visibleSections((p) => auth.can(p)))
const activeId = computed(() => activeSection(route.path, sections.value, detailOrigin.value))
const currentSection = computed(() => sections.value.find((section) => section.id === activeId.value))
const activePath = computed(() => activeMenuPath(route.path, sections.value.map((section) => ({ title: section.label, items: section.items }))))
const tabSection = computed(() => {
  const section = currentSection.value
  return section && section.id !== 'admin' && section.items.length >= 2 && section.items.some((item) => item.path === route.path)
    ? section : undefined
})
const adminSection = computed(() => sections.value.find((section) => section.id === 'admin' && section.items.some((item) => item.path === route.path)))
const roleText = computed(() => (auth.me?.roles ?? []).map((r) => ROLE_LABEL[r.code] ?? r.name).join('、'))
const avatarText = computed(() => {
  const chars = Array.from(auth.me?.realName?.trim() ?? '')
  return chars.length <= 2 ? chars[0] : chars.slice(-2).join('')
})

let pendingRequest = 0
async function refreshPending() {
  const request = ++pendingRequest
  if (!auth.can('TASK_HANDLE')) {
    pendingCount.value = 0
    return
  }
  try {
    const result = await api.tasks.pendingCount()
    if (request === pendingRequest) pendingCount.value = result.count
  } catch {
    // 计数只是提示，接口失败时保留上次结果。
  }
}

watch(() => route.fullPath, async (_path, previousPath, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  drawer.value = false
  void refreshPending()
  if (route.name !== 'application-detail' && route.name !== 'application-edit') {
    detailOrigin.value = undefined
    return
  }
  const path = route.path
  const state = window.history.state
  const sources = [route.query.from, state?.sectionFrom, previousPath, state?.back, detailOrigin.value]
  detailOrigin.value = detailSectionHint(sources, sections.value)
  if (!detailOrigin.value) {
    try {
      const detail = await api.applications.detail(Number(route.params.id))
      if (!current || route.path !== path) return
      detailOrigin.value = detailSectionHint([], sections.value, detail.applicant.id, auth.me?.id)
    } catch {
      // 详情页自身呈现读取错误，外壳保持权限允许的默认栏目。
    }
  }
  if (current && route.path === path && detailOrigin.value) {
    window.history.replaceState({ ...window.history.state, sectionFrom: detailOrigin.value }, '')
  }
}, { immediate: true })

// 实时通知：保留未读角标、用户提醒、详情页自动刷新与通知点击行为。
useSse((e) => {
  notice.onEvent(e)
  void refreshPending()
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

onBeforeUnmount(() => {
  pendingRequest += 1
  notice.reset()
})
function onCommand(cmd: string) {
  if (cmd === 'profile') void router.push('/profile')
  if (cmd === 'logout') void auth.logout()
}
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <button v-if="isMobile" class="icon-btn" type="button" aria-label="打开菜单" :aria-expanded="drawer" @click="drawer = true">
        <el-icon :size="20"><MenuIcon /></el-icon>
      </button>
      <router-link class="brand" to="/" aria-label="企业审批，工作台">
        <span class="logo" aria-hidden="true">审</span><span class="brand-text">企业审批</span>
      </router-link>
      <nav v-if="!isMobile" class="section-nav" aria-label="主导航">
        <router-link
          v-for="section in sections" :key="section.id" :to="section.items[0].path"
          class="section-link" :class="{ 'is-active': activeId === section.id }"
          :aria-current="activeId === section.id ? 'true' : undefined"
        >
          {{ section.label }}<span v-if="section.id === 'approval' && pendingCount" class="pending-count">{{ pendingCount }}</span>
        </router-link>
      </nav>
      <div class="topbar-right">
        <NoticeBell />
        <el-dropdown trigger="click" @command="onCommand">
          <button class="user" type="button" aria-label="用户菜单">
            <el-avatar :size="28" class="avatar">{{ avatarText }}</el-avatar>
            <span v-if="!isMobile" class="user-name">{{ auth.me?.realName }}</span>
            <el-icon v-if="!isMobile"><ArrowDown /></el-icon>
          </button>
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
      </div>
    </header>

    <el-drawer v-if="isMobile" v-model="drawer" direction="ltr" size="280px" title="页面导航" class="nav-drawer">
      <nav aria-label="全部页面" class="drawer-nav">
        <section v-for="section in sections" :key="section.id" class="drawer-section">
          <h2>{{ section.label }}<span v-if="section.id === 'approval' && pendingCount" class="pending-count">{{ pendingCount }}</span></h2>
          <router-link
            v-for="item in section.items" :key="item.path" :to="item.path"
            :class="{ 'is-active': activePath === item.path }" :aria-current="activePath === item.path ? 'page' : undefined"
          >{{ item.title }}</router-link>
        </section>
      </nav>
    </el-drawer>

    <div ref="desk" class="desk">
      <PaperField base="--eas-desk" class="layout-paper" :container="() => desk" />
      <main class="content-column">
        <SectionTabs v-if="tabSection" :section="tabSection" :active-path="route.path" :pending-count="pendingCount" :hide-tabs="isMobile" />
        <div class="route-layout" :class="{ 'has-admin-index': adminSection && !isMobile }">
          <AdminIndex v-if="adminSection && !isMobile" :items="adminSection.items" :active-path="activePath" />
          <div class="routed-page" :class="{ 'section-page': tabSection && !isMobile, 'admin-page': adminSection && !isMobile, sheet: adminSection && !isMobile }">
            <router-view v-slot="{ Component, route: r }">
              <component :is="Component" :key="KEYED_ROUTES.has(String(r.name)) ? r.path : undefined" />
            </router-view>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout { min-height: 100vh; background: var(--eas-desk); }
.topbar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: flex-end;
  box-sizing: border-box;
  height: 56px;
  padding: 0 32px;
  gap: 40px;
  background: var(--eas-sheet);
  border-bottom: 1px solid var(--eas-rule);
}
.brand { display: inline-flex; align-items: center; align-self: center; gap: 10px; flex: none; color: var(--eas-primary); text-decoration: none; white-space: nowrap; }
.logo { display: grid; place-items: center; box-sizing: border-box; width: 28px; height: 28px; border: 1.5px solid var(--eas-primary); border-radius: var(--eas-radius-control); font: 700 16px var(--eas-font-serif); }
.brand-text { font: 600 17px var(--eas-font-serif); letter-spacing: 0.04em; }
.section-nav { display: flex; gap: 4px; height: 44px; margin-bottom: -1px; }
.section-link { display: flex; align-items: center; gap: 6px; padding: 0 18px; border-radius: 8px 8px 0 0; color: var(--eas-ink-2); text-decoration: none; font-size: 15px; white-space: nowrap; }
.section-link:hover { background: var(--eas-row-hover); color: var(--eas-ink); }
.section-link.is-active { background: var(--eas-desk); color: var(--eas-ink); font-weight: 600; }
.pending-count { color: var(--eas-primary); font-size: var(--eas-fs-xs); font-weight: 600; font-variant-numeric: tabular-nums; }
.topbar-right { display: flex; align-items: center; gap: 20px; align-self: center; margin-left: auto; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 36px; height: 36px; padding: 0; border: 0; border-radius: var(--eas-radius-control); background: transparent; color: var(--eas-ink); cursor: pointer; }
.icon-btn:hover, .user:hover { background: var(--eas-row-hover); }
.user { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 8px; border: 0; border-radius: var(--eas-radius-control); background: transparent; color: var(--eas-ink); font: inherit; cursor: pointer; }
.avatar { background: var(--eas-primary-tint); color: var(--eas-primary); font-size: var(--eas-fs-xs); font-weight: 600; }
.user-card { padding: 10px 16px 6px; min-width: 180px; border-bottom: 1px solid var(--eas-rule); }
.user-card-name { font-weight: 600; margin-bottom: 2px; }
.desk { position: relative; min-height: calc(100vh - 56px); }
.layout-paper { z-index: 0; }
.content-column { position: relative; z-index: 1; box-sizing: border-box; max-width: 1280px; margin: 0 auto; padding: 32px 40px 40px; }
.route-layout, .routed-page { min-width: 0; }
.route-layout.has-admin-index { display: grid; grid-template-columns: 200px minmax(0, 1fr); align-items: start; }
.routed-page.admin-page { padding: 24px; }
/* 页内第一张单据与外壳页签相接；页面迁移后保持 .page > .sheet 结构。 */
.section-page :deep(.page > .sheet:not(.sheet ~ .sheet)), .section-page :deep(> .sheet) { border-top-left-radius: 0; }
.admin-page :deep(.page > .sheet:not(.sheet ~ .sheet)), .admin-page :deep(> .sheet) { border-top-left-radius: 0; border-bottom-left-radius: 0; }
.drawer-section + .drawer-section { margin-top: 20px; }
.drawer-section h2 { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; padding: 0 16px; color: var(--eas-ink-2); font-size: var(--eas-fs-xs); font-weight: 500; }
.drawer-section a { display: flex; align-items: center; min-height: 40px; padding: 0 16px; border-radius: var(--eas-radius-control); color: var(--eas-ink); text-decoration: none; }
.drawer-section a:hover { background: var(--eas-row-hover); }
.drawer-section a.is-active { background: var(--eas-sheet); font-weight: 600; }
@media (min-width: 768px) and (max-width: 1000px) {
  .topbar { gap: 16px; padding: 0 20px; }
  .section-link { padding: 0 12px; }
  .topbar-right { gap: 8px; }
}
@media (max-width: 767px) {
  .topbar { align-items: center; gap: 10px; padding: 0 12px; }
  .topbar-right { gap: 8px; }
  .user { padding: 4px; }
  .content-column { padding: 24px 16px 32px; }
}
</style>

<style>
.clickable-notification { cursor: pointer; }
.nav-drawer.el-drawer { background: var(--eas-desk); }
.nav-drawer .el-drawer__body { padding: 8px 16px 24px; }
</style>
