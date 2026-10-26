<script setup lang="ts">
// 403：路由守卫发现缺少功能权限时跳转到这里（权限以后端为准，这里只负责体验）
import { useRouter } from 'vue-router'
import forbiddenImg from '@/assets/illustrations/forbidden.webp'

const router = useRouter()
</script>

<template>
  <div class="page result-page">
    <section class="sheet result-sheet">
      <div class="pic">
        <img :src="forbiddenImg" alt="" width="210" height="210" />
      </div>
      <h1 class="result-title">没有权限访问</h1>
      <p class="result-line">需要相应权限，可联系系统管理员。</p>
      <el-button type="primary" @click="router.push('/')">回到工作台</el-button>
    </section>
  </div>
</template>

<style scoped>
.result-page {
  min-height: calc(100vh - var(--eas-header-height) - 120px);
  justify-content: center;
  align-items: center;
}
.result-sheet {
  box-sizing: border-box;
  width: 100%;
  max-width: 600px;
  padding: 56px 32px 64px;
  text-align: center;
  margin: 0 auto;
}
.pic {
  position: relative;
  width: 210px;
  height: 210px;
  max-width: calc(100% - 18px);
  aspect-ratio: 1;
  margin: 0 auto 28px;
}
.pic::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--eas-mustard);
  transform: translate(9px, 9px);
}
.pic img {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}
.result-title {
  margin: 0 0 10px;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-32);
  font-weight: 600;
  line-height: var(--eas-lh-title);
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
}
.result-line {
  margin: 0 0 28px;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}
@media (max-width: 767px) {
  .result-sheet {
    padding: 40px 20px 48px;
  }
}
</style>
