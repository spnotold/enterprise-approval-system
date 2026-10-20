<script setup lang="ts">
import { computed } from 'vue'
import { adminMenuGroups, type MenuItem } from '@/router/menu'

const props = defineProps<{ items: MenuItem[]; activePath: string }>()
const groups = computed(() => adminMenuGroups(props.items))
</script>

<template>
  <nav class="admin-index" aria-label="管理页面">
    <div v-for="group in groups" :key="group.id" class="admin-index-group">
      <div class="admin-index-label">{{ group.label }}</div>
      <router-link
        v-for="item in group.items"
        :key="item.path"
        :to="item.path"
        class="admin-index-item"
        :class="{ 'is-active': activePath === item.path }"
        :aria-current="activePath === item.path ? 'page' : undefined"
      >{{ item.title }}</router-link>
    </div>
  </nav>
</template>

<style scoped>
.admin-index { width: 200px; min-width: 0; padding-top: 8px; }
.admin-index-group + .admin-index-group { margin-top: 20px; }
.admin-index-label { padding: 0 20px 6px; font-size: var(--eas-fs-xs); color: var(--eas-ink-2); }
.admin-index-item {
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-height: 40px;
  margin-right: -1px;
  padding: 8px 20px;
  border: 1px solid transparent;
  border-right: 0;
  border-radius: var(--eas-radius-panel) 0 0 var(--eas-radius-panel);
  color: var(--eas-ink-2);
  text-decoration: none;
}
.admin-index-item:hover { color: var(--eas-ink); background: var(--eas-row-hover); }
.admin-index-item.is-active { z-index: 1; background: var(--eas-sheet); color: var(--eas-ink); border-color: var(--eas-rule); font-weight: 600; }
</style>
