<script setup lang="ts">
// 403：路由守卫发现缺少功能权限时跳转到这里（权限以后端为准，这里只负责体验）
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="page result-page">
    <div class="sheet result-sheet">
      <h2 class="result-title">没有权限访问</h2>
      <p class="result-line">需要相应权限，可联系系统管理员。</p>
      <el-button type="primary" @click="router.push('/')">返回工作台</el-button>
    </div>
  </div>
</template>

<style scoped>
.result-page {
  min-height: 50vh;
  justify-content: center;
  align-items: center;
}
.result-sheet {
  box-sizing: border-box;
  width: 100%;
  max-width: 480px;
  padding: 40px 32px;
}
.result-title {
  margin: 0;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-doc);
  font-weight: 600;
  color: var(--eas-ink);
}
.result-line {
  margin: 12px 0 24px;
  font-size: var(--eas-fs-14);
  color: var(--eas-ink-2);
}
</style>
