<script setup lang="ts">
defineProps<{ label: string; full?: boolean }>()
</script>

<template>
  <div class="slip-field" :class="{ full }">
    <dt>{{ label }}</dt>
    <dd><slot /></dd>
  </div>
</template>

<style scoped>
.slip-field {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  column-gap: 0;
  padding: 9px 0;

  line-height: 1.6;
}
.slip-field.full {
  grid-column: 1 / -1;
}
dt {
  color: var(--eas-ink-2);
}
dd {
  margin: 0;
  min-width: 0;
  color: var(--eas-ink);
  overflow-wrap: anywhere;
}
@media (max-width: 480px) {
  .slip-field {
    grid-template-columns: 96px minmax(0, 1fr);
  }
}
</style>
