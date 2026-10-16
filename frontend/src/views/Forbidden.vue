<script setup lang="ts">
// 403：路由守卫发现缺少功能权限时跳转到这里（权限以后端为准，这里只负责体验）
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="page result-page">
    <div class="result">
      <h2 class="page-title"><span class="code">403</span>无权访问该页面</h2>
      <p class="hint">如需访问，请联系系统管理员授予相应权限。</p>
      <el-button type="primary" @click="router.push('/')">返回工作台</el-button>
    </div>
  </div>
</template>

<style scoped>
.result-page {
  min-height: 50vh;
  justify-content: center;
}
.code {
  margin-right: 16px;
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}
.hint {
  margin: 8px 0 20px;
  color: var(--eas-ink-2);
}
</style>
