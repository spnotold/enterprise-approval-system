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
