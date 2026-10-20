<script setup lang="ts">
// 404：未匹配的路由
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="page result-page">
    <div class="sheet result-sheet">
      <h2 class="result-title">页面不存在</h2>
      <p class="result-line">请检查地址是否正确。</p>
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
