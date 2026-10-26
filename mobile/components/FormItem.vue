<script setup lang="ts">
// 表单项：标签、必填星号、帮助文字、字段下方红字错误
defineProps<{
  label: string
  required?: boolean
  error?: string
  help?: string | null
}>()
</script>

<template>
  <view class="field">
    <view class="field-label">
      <text v-if="required" class="req">*</text>
      <text>{{ label }}</text>
    </view>
    <slot />
    <view v-if="help && !error" class="field-help">{{ help }}</view>
    <view v-if="error" class="field-err">{{ error }}</view>
  </view>
</template>

<style scoped>
.field-label {
  color: var(--eas-ink);
  font-size: var(--eas-fs-sm);
}

.req {
  color: var(--eas-rust);
}

.field-help {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
}

.field-err {
  color: var(--eas-rust-deep);
  font-size: var(--eas-fs-xs);
}

.field-label,
.field-help,
.field-err {
  overflow-wrap: anywhere;
}
</style>
