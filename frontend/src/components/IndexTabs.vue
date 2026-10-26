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
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}
.index-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow-x: auto;
  /* 给错版投影留位置，免得被滚动容器裁掉 */
  padding: 2px 6px 6px 2px;
  margin: -2px -6px -6px -2px;
  scrollbar-width: thin;
}
.index-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: none;
  box-sizing: border-box;
  min-height: 36px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--eas-radius-pill);
  background: var(--eas-tab);
  color: var(--eas-ink-2);
  font: inherit;
  font-size: var(--eas-fs-sm);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color var(--eas-dur-fast) var(--eas-ease),
    box-shadow var(--eas-dur-fast) var(--eas-ease);
}
.index-tab:hover { color: var(--eas-ink); }
.index-tab.is-active {
  background-color: var(--eas-ink);
  background-image: var(--eas-grain);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
  font-weight: 600;
  box-shadow: var(--eas-offset-mark);
}
.tab-count {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  box-sizing: border-box;
  border-radius: var(--eas-radius-pill);
  background-color: var(--eas-mustard);
  color: var(--eas-ink);
  font: 600 12px/1 var(--eas-font-display);
  font-variant-numeric: tabular-nums;
}
.index-tab-actions {
  align-self: stretch;
  display: flex;
  align-items: center;
  flex: none;
}
.index-tab-actions:empty { display: none; }
@media (max-width: 767px) {
  .index-tabs-row { gap: 8px; }
  .index-tab { padding: 0 14px; }
}
</style>
