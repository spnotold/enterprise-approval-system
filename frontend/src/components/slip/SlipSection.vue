<script setup lang="ts">
// 单据里的一节：小标题 + 顶部分隔线，不单独成卡片
defineProps<{ title: string }>()
</script>

<template>
  <section class="slip-section">
    <div class="slip-section-head">
      <h3 class="slip-section-title">{{ title }}</h3>
      <div v-if="$slots.extra || $slots.note" class="slip-section-note"><slot name="extra" /><slot name="note" /></div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.slip-section {
  min-width: 0;
  padding: 22px var(--eas-sheet-inset, var(--eas-sheet-pad-wide));
  border-top: 1px solid var(--eas-rule);
}
.slip-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.slip-section-title {
  margin: 0;
  color: var(--eas-ink);
  font-size: var(--eas-fs-md);
  font-weight: 600;
}
.slip-section-note { color: var(--eas-ink-3); font-size: var(--eas-fs-12); }
</style>
