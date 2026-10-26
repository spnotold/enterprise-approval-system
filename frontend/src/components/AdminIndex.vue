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
.admin-index { width: 200px; min-width: 0; padding-top: 4px; }
.admin-index-group + .admin-index-group { margin-top: 22px; }
.admin-index-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 8px;
  font-family: var(--eas-font-display);
  font-size: 17px;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
}
.admin-index-item {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-height: 38px;
  margin: 0 6px 6px 0;
  padding: 0 16px;
  border-radius: var(--eas-radius-pill);
  color: var(--eas-ink-2);
  text-decoration: none;
  transition: color var(--eas-dur-fast) var(--eas-ease);
}
.admin-index-item:hover { color: var(--eas-ink); background: color-mix(in srgb, var(--eas-tab) 70%, transparent); }
.admin-index-item.is-active {
  background-color: var(--eas-ink);
  background-image: var(--eas-grain);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
  font-weight: 600;
  box-shadow: var(--eas-offset-mark);
}
</style>
