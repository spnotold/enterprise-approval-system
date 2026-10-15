<script setup lang="ts">
// 404：未匹配的路由
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="page result-page">
    <el-result icon="info" title="404" sub-title="页面不存在">
      <template #extra>
        <p class="muted small hint">请检查地址是否正确，或从左侧菜单进入。</p>
        <el-button type="primary" @click="router.push('/')">返回工作台</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.result-page {
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
.hint {
  margin: 0 0 16px;
}
</style>
