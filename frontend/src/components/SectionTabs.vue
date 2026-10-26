<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import IndexTabs from '@/components/IndexTabs.vue'
import { sectionTabLink } from '@/components/sectionTabLink'
import type { MenuSection } from '@/router/menu'

const props = defineProps<{ section: MenuSection; activePath: string; pendingCount?: number; hideTabs?: boolean }>()
const route = useRoute()
const tabs = computed(() => props.section.items.map((item) => ({
  key: item.path,
  label: item.title,
  to: sectionTabLink(item.path, props.activePath, route.query),
  count: item.path === '/tasks/pending' ? props.pendingCount : undefined,
})))
</script>

<template>
  <header class="section-head">
    <h1 class="section-title-lg">{{ section.label }}</h1>
    <IndexTabs :items="tabs" :active="activePath" :label="section.label" :hide-tabs="hideTabs" class="section-tabs" :class="{ 'is-compact': hideTabs }">
      <template #actions>
        <!-- 页面使用 <Teleport to="#section-actions" defer> 放置操作；窄屏只隐藏导航，保留同一目标节点。 -->
        <div id="section-actions" />
      </template>
    </IndexTabs>
  </header>
</template>

<style scoped>
.section-head {
  position: relative;
  z-index: 1;
  margin-bottom: 24px;
}
.section-title-lg {
  margin: 0 0 16px;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-xl);
  font-weight: 600;
  line-height: var(--eas-lh-title);
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
}
#section-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}
.section-tabs.is-compact { justify-content: flex-end; }
.section-tabs.is-compact:has(#section-actions:empty) { display: none; }
@media (max-width: 767px) {
  .section-title-lg { margin-bottom: 12px; font-size: var(--eas-fs-32); }
}
</style>
