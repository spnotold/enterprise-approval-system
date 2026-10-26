<script setup lang="ts">
// 管理端对话框内的服务端校验错误（40000 / 42201）：显示 message 与 errors[].message
import type { ApiError } from '@/lib/http'

defineProps<{ error: ApiError | null }>()
</script>

<template>
  <el-alert v-if="error" type="error" :closable="false" show-icon class="server-error-alert">
    <template #title>{{ error.message || '操作失败' }}</template>
    <ul v-if="error.errors.length" class="server-error-list">
      <li v-for="(e, i) in error.errors" :key="i">{{ e.message }}</li>
    </ul>
  </el-alert>
</template>

<style scoped>
.server-error-alert {
  margin-bottom: 12px;
}
.server-error-list {
  margin: 6px 0 0;
  padding-left: 0;
  list-style: none;
}
.server-error-list li {
  display: flex;
  gap: 8px;
  font-size: var(--eas-fs-note);
  line-height: 1.6;
}
.server-error-list li::before {
  content: '—';
  flex: none;
  opacity: 0.7;
}
</style>
