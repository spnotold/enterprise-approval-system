<script setup lang="ts">
// 可复用的索引页签：传 to 渲染路由链接；不传时发出 select，供统计 / 通知页内切换。
import type { RouteLocationRaw } from 'vue-router'

export interface IndexTab {
  key: string
  label: string
  to?: RouteLocationRaw
  count?: number
}

withDefaults(defineProps<{ items: IndexTab[]; active: string; label?: string; hideTabs?: boolean }>(), { label: '视图', hideTabs: false })
defineEmits<{ select: [key: string] }>()
</script>

<template>
  <div class="index-tabs-row">
    <nav v-if="!hideTabs" class="index-tabs" :aria-label="label">
      <template v-for="item in items" :key="item.key">
        <router-link
          v-if="item.to"
          :to="item.to"
          class="index-tab"
          :class="{ 'is-active': active === item.key }"
          :aria-current="active === item.key ? 'page' : undefined"
        >
          {{ item.label }}<span v-if="item.count" class="tab-count">{{ item.count }}</span>
        </router-link>
        <button
          v-else
          type="button"
          class="index-tab"
          :class="{ 'is-active': active === item.key }"
          :aria-pressed="active === item.key"
          @click="$emit('select', item.key)"
        >
          {{ item.label }}<span v-if="item.count" class="tab-count">{{ item.count }}</span>
        </button>
      </template>
    </nav>
    <div class="index-tab-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.index-tabs-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}
.index-tabs {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  padding: 3px 3px 0;
  margin: -3px -3px 0;
  scrollbar-width: thin;
}
.index-tab {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  flex: none;
  box-sizing: border-box;
  min-height: 42px;
  padding: 9px 20px;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--eas-radius-panel) var(--eas-radius-panel) 0 0;
  background: var(--eas-tab);
  color: var(--eas-ink-2);
  font: inherit;
  font-size: var(--eas-fs-sm);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.index-tab:hover { color: var(--eas-ink); }
.index-tab.is-active {
  z-index: 1;
  background: var(--eas-sheet);
  color: var(--eas-ink);
  border-color: var(--eas-rule);
  font-weight: 600;
}
.tab-count {
  color: var(--eas-primary);
  font-size: var(--eas-fs-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.index-tab-actions {
  flex: none;
  padding-bottom: 8px;
}
.index-tab-actions:empty { display: none; }
@media (max-width: 767px) {
  .index-tabs-row { gap: 8px; }
  .index-tab { padding: 9px 12px; }
}
</style>
