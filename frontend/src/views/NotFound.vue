<script setup lang="ts">
// 404：未匹配的路由
import { useRouter } from 'vue-router'
import notFoundImg from '@/assets/illustrations/not-found.webp'

const router = useRouter()
</script>

<template>
  <div class="page result-page">
    <section class="sheet result-sheet">
      <div class="pic">
        <img :src="notFoundImg" alt="" width="210" height="210" />
      </div>
      <h1 class="result-title">页面不存在</h1>
      <p class="result-line">请检查地址是否正确。</p>
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
