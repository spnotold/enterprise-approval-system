<script setup lang="ts">
// 单据里的一节：小标题 + 顶部分隔线，不单独成卡片
defineProps<{ title: string }>()
</script>

<template>
  <section class="slip-section">
    <div class="slip-section-head">
      <h3 class="slip-section-title">{{ title }}</h3>
      <slot name="extra" />
    </div>
    <slot />
  </section>
</template>

<style scoped>
.slip-section {
  padding-top: 20px;
  border-top: 1px solid var(--eas-rule);
}
.slip-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.slip-section-title {
  margin: 0;
  color: var(--eas-ink);
  font-size: var(--eas-fs-md);
  font-weight: 600;
}
</style>
