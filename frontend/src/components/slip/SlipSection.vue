<script setup lang="ts">
// 单据里的一节：小标题 + 顶部分隔线，不单独成卡片
withDefaults(defineProps<{ title: string; glyph?: 'sun' | 'leaf' | 'hill' | 'bell' | 'stack' }>(), { glyph: undefined })
</script>

<template>
  <section class="slip-section">
    <div class="slip-section-head">
      <h3 class="slip-section-title"><i v-if="glyph" class="ink-glyph" :class="`ink-glyph--${glyph}`" aria-hidden="true" />{{ title }}</h3>
      <div v-if="$slots.extra || $slots.note" class="slip-section-note"><slot name="extra" /><slot name="note" /></div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.slip-section {
  min-width: 0;
  padding: 18px var(--eas-sheet-inset, var(--eas-sheet-pad-wide)) 26px;
  border-top: 2px dashed var(--eas-rule);
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
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--eas-ink);
  font-family: var(--eas-font-display);
  font-size: 21px;
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: var(--eas-display-tracking);
}
.slip-section-note { color: var(--eas-ink-3); font-size: var(--eas-fs-xs); }
</style>
