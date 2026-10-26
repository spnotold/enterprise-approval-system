<script setup lang="ts">
// 套色外壳：顶栏栏目、栏目标题与胶囊页签、管理索引，背后铺满风景（风吹草地、飘叶）。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElNotification } from 'element-plus'
import { ArrowDown, Menu as MenuIcon } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { noticeTarget, useNoticeStore } from '@/stores/notice'
import { useSse } from '@/composables/useSse'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { provideApplicationContext } from '@/composables/applicationContext'
import { activeMenuPath, activeSection, visibleSections } from '@/router/menu'
import { detailSectionHint } from '@/router/sectionContext'
import { NOTIFICATION_TYPE_LABEL, ROLE_LABEL } from '@/lib/labels'
import AdminIndex from '@/components/AdminIndex.vue'
import NoticeBell from '@/components/NoticeBell.vue'
import SceneryField from '@/components/SceneryField.vue'
import SectionTabs from '@/components/SectionTabs.vue'

const auth = useAuthStore()
const notice = useNoticeStore()
const route = useRoute()
const router = useRouter()
const { isMobile } = useBreakpoint('(max-width: 767px)')
const KEYED_ROUTES = new Set(['application-detail', 'application-edit', 'apply-custom', 'admin-template-design'])
const drawer = ref(false)
const pendingCount = ref(0)
const detailOrigin = ref<string>()
const applicationContext = provideApplicationContext(() =>
  route.name === 'application-detail' || route.name === 'application-edit' ? Number(route.params.id) : undefined,
)
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

function rememberDetailOrigin() {
  if (detailOrigin.value) window.history.replaceState({ ...window.history.state, sectionFrom: detailOrigin.value }, '')
}

watch(() => route.fullPath, (_path, previousPath) => {
  drawer.value = false
  void refreshPending()
  if (route.name !== 'application-detail' && route.name !== 'application-edit') {
    detailOrigin.value = undefined
    return
  }
  const state = window.history.state
  const sources = [route.query.from, state?.sectionFrom, previousPath, state?.back, detailOrigin.value]
  detailOrigin.value = detailSectionHint(sources, sections.value)
  rememberDetailOrigin()
}, { immediate: true })

watch(applicationContext.applicantId, (applicantId) => {
  if (detailOrigin.value || applicantId == null) return
  detailOrigin.value = detailSectionHint([], sections.value, applicantId, auth.me?.id)
  rememberDetailOrigin()
})

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
          <span class="section-link-text">{{ section.label }}</span><span v-if="section.id === 'approval' && pendingCount" class="pending-count">{{ pendingCount }}</span>
        </router-link>
      </nav>
      <div class="topbar-right">
        <NoticeBell />
        <el-dropdown trigger="click" @command="onCommand">
          <button class="user" type="button" aria-label="用户菜单">
            <el-avatar :size="36" class="avatar">{{ avatarText }}</el-avatar>
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

    <el-drawer v-if="isMobile" v-model="drawer" direction="ltr" size="280px" class="nav-drawer">
      <template #header>
        <router-link class="brand drawer-brand" to="/" aria-label="企业审批，工作台" @click="drawer = false">
          <span class="logo" aria-hidden="true">审</span><span class="brand-text">企业审批</span>
        </router-link>
      </template>
      <nav aria-label="全部页面" class="drawer-nav">
        <section v-for="section in sections" :key="section.id" class="drawer-section">
          <h2 v-if="section.items.length > 1">
            {{ section.label }}<span v-if="section.id === 'approval' && pendingCount" class="pending-count">{{ pendingCount }}</span>
          </h2>
          <router-link
            v-for="item in section.items" :key="item.path" :to="item.path"
            :class="{ 'is-active': activePath === item.path }" :aria-current="activePath === item.path ? 'page' : undefined"
            @click="drawer = false"
          >
            {{ item.title }}<span v-if="section.items.length === 1 && section.id === 'approval' && pendingCount" class="pending-count">{{ pendingCount }}</span>
          </router-link>
        </section>
      </nav>
    </el-drawer>

    <SceneryField />
    <div class="desk">
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
.layout { position: relative; min-height: 100vh; background: var(--eas-desk); }
.topbar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: var(--eas-header-height);
  padding: 0 48px;
  gap: 36px;
}
.brand { display: inline-flex; align-items: center; gap: 12px; flex: none; color: var(--eas-ink); text-decoration: none; white-space: nowrap; }
/* 品牌章：铁锈圆 + 芥黄错版 */
.logo {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background-color: var(--eas-rust);
  background-image: var(--eas-grain);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
  font: 400 18px var(--eas-font-display);
  box-shadow: var(--eas-offset-mark);
}
.brand-text { font: 600 21px var(--eas-font-display); letter-spacing: var(--eas-display-tracking); }
.section-nav { display: flex; align-items: center; gap: 8px; }
.section-link {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  color: var(--eas-ink-2);
  text-decoration: none;
  font-size: var(--eas-fs-nav);
  white-space: nowrap;
  transition: color var(--eas-dur-fast) var(--eas-ease);
}
.section-link:hover { color: var(--eas-ink); }
.section-link.is-active { color: var(--eas-ink); font-weight: 600; }
/* 当前栏目：一块手刷的芥黄墨斑垫在字后面 */
.section-link.is-active::before {
  content: '';
  position: absolute;
  inset: 3px 0 1px;
  z-index: -1;
  border-radius: 58% 42% 55% 45% / 62% 48% 52% 38%;
  background-color: var(--eas-mustard-tint);
  background-image: var(--eas-grain);
  background-blend-mode: multiply;
  transform: rotate(-2deg);
}
.pending-count {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  box-sizing: border-box;
  border-radius: var(--eas-radius-pill);
  background-color: var(--eas-mustard);
  background-image: var(--eas-grain);
  background-blend-mode: multiply;
  color: var(--eas-ink);
  font: 600 12px/1 var(--eas-font-display);
  font-variant-numeric: tabular-nums;
}
.topbar-right { display: flex; align-items: center; gap: 18px; margin-left: auto; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 38px; height: 38px; padding: 0; border: 0; border-radius: 50%; background: var(--eas-sheet); box-shadow: 3px 3px 0 var(--eas-shade); color: var(--eas-ink); cursor: pointer; }
.user { display: inline-flex; align-items: center; gap: 10px; min-height: 38px; padding: 2px 10px 2px 2px; border: 0; border-radius: var(--eas-radius-pill); background: transparent; color: var(--eas-ink); font: inherit; font-weight: 600; cursor: pointer; }
.user:hover { background: color-mix(in srgb, var(--eas-sheet) 70%, transparent); }
.avatar {
  background-color: var(--eas-sage);
  background-image: var(--eas-grain);
  background-blend-mode: multiply;
  color: var(--eas-ink);
  font: 400 17px var(--eas-font-display);
}
.user-card { padding: 12px 16px 8px; min-width: 180px; border-bottom: 2px dashed var(--eas-rule); }
.user-card-name { font-weight: 600; margin-bottom: 2px; }
.desk { position: relative; z-index: 1; min-height: calc(100vh - var(--eas-header-height)); }
.content-column { position: relative; box-sizing: border-box; max-width: var(--eas-content-max); margin: 0 auto; padding: 12px 48px 56px; }
.route-layout, .routed-page { min-width: 0; }
.route-layout.has-admin-index { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 28px; align-items: start; }
.routed-page.admin-page { padding: 24px; }
.drawer-section + .drawer-section { margin-top: 20px; }
.drawer-section h2 { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; padding: 0 16px; color: var(--eas-ink); font: 400 17px var(--eas-font-display); letter-spacing: var(--eas-display-tracking); }
.drawer-section a { display: flex; align-items: center; gap: 6px; min-height: 42px; margin-bottom: 4px; padding: 0 16px; border-radius: var(--eas-radius-pill); color: var(--eas-ink-2); text-decoration: none; }
.drawer-section a:hover { background: var(--eas-tab); color: var(--eas-ink); }
.drawer-section a.is-active { background-color: var(--eas-ink); background-image: var(--eas-grain); background-blend-mode: multiply; color: var(--eas-sheet); font-weight: 600; box-shadow: var(--eas-offset-mark); }
@media (min-width: 768px) and (max-width: 1000px) {
  .topbar { gap: 16px; padding: 0 20px; }
  .section-link { padding: 0 10px; }
  .topbar-right { gap: 10px; }
  .content-column { padding: 12px 24px 48px; }
}
@media (max-width: 767px) {
  .topbar { gap: 10px; height: 64px; padding: 0 14px; }
  .topbar-right { gap: 10px; }
  .user { padding: 2px; }
  .content-column { padding: 8px 16px 40px; }
}
</style>

<style>
.clickable-notification { cursor: pointer; }
.nav-drawer.el-drawer { background: var(--eas-sheet); }
.nav-drawer .el-drawer__header { margin-bottom: 0; padding: 18px 24px 10px; }
.nav-drawer .drawer-brand { flex: 1; padding: 0; }
.nav-drawer .el-drawer__body { padding: 8px 16px 24px; }
</style>
