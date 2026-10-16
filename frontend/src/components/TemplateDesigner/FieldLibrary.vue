<script setup lang="ts">
// 字段库：点击追加一个字段到表单末尾
import type { Component } from 'vue'
import { Calendar, CircleCheck, Document, EditPen, Money, Odometer, Paperclip } from '@element-plus/icons-vue'
import type { FieldType } from '@/lib/types'
import { FIELD_TYPE_LABEL } from '@/lib/labels'
import { FIELD_TYPES } from './utils'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ add: [type: FieldType] }>()

const ICONS: Record<FieldType, Component> = {
  TEXT: EditPen,
  TEXTAREA: Document,
  NUMBER: Odometer,
  AMOUNT: Money,
  DATE: Calendar,
  RADIO: CircleCheck,
  ATTACHMENT: Paperclip,
}
</script>

<template>
  <div class="field-library">
    <div class="panel-title">字段库</div>
    <div class="muted small hint">点击添加到表单末尾</div>
    <div class="lib-list">
      <button
        v-for="t in FIELD_TYPES"
        :key="t"
        type="button"
        class="lib-item"
        :disabled="disabled"
        @click="emit('add', t)"
      >
        <el-icon><component :is="ICONS[t]" /></el-icon>
        <span>{{ FIELD_TYPE_LABEL[t] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.field-library {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.panel-title {
  font-weight: 600;
  font-size: 14px;
}
.hint {
  margin-bottom: 4px;
}
.lib-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lib-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: var(--eas-radius-panel);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--eas-dur-fast) var(--eas-ease),
    color var(--eas-dur-fast) var(--eas-ease);
}
.lib-item:hover:not(:disabled) {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.lib-item:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
@media (max-width: 1199px) {
  .lib-list {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
