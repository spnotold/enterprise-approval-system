<script setup lang="ts">
import { computed } from 'vue'
import IndexTabs from '@/components/IndexTabs.vue'
import type { MenuSection } from '@/router/menu'

const props = defineProps<{ section: MenuSection; activePath: string; pendingCount?: number; hideTabs?: boolean }>()
const tabs = computed(() => props.section.items.map((item) => ({
  key: item.path,
  label: item.title,
  to: item.path,
  count: item.path === '/tasks/pending' ? props.pendingCount : undefined,
})))
</script>

<template>
  <IndexTabs :items="tabs" :active="activePath" :label="section.label" :hide-tabs="hideTabs" class="section-tabs" :class="{ 'is-compact': hideTabs }">
    <template #actions>
      <!-- 页面使用 <Teleport to="#section-actions" defer> 放置操作；窄屏只隐藏导航，保留同一目标节点。 -->
      <div id="section-actions" />
    </template>
  </IndexTabs>
</template>

<style scoped>
.section-tabs {
  position: relative;
  z-index: 1;
  margin-bottom: -1px;
}
#section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-tabs.is-compact { justify-content: flex-end; margin-bottom: 24px; }
.section-tabs.is-compact:has(#section-actions:empty) { display: none; }
.section-tabs.is-compact :deep(.index-tab-actions) { padding-bottom: 0; }
</style>
