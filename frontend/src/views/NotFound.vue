<script setup lang="ts">
// 404：未匹配的路由
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="page result-page">
    <div class="result">
      <h2 class="page-title"><span class="code">404</span>页面不存在</h2>
      <p class="hint">请检查地址是否正确，或从左侧菜单进入。</p>
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
