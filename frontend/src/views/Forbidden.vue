<script setup lang="ts">
// 403：路由守卫发现缺少功能权限时跳转到这里（权限以后端为准，这里只负责体验）
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="page result-page">
    <el-result icon="warning" title="403" sub-title="无权访问该页面">
      <template #extra>
        <p class="muted small hint">如需访问，请联系系统管理员授予相应权限。</p>
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
