<script setup lang="ts">
// 字段库：点击追加一个字段到表单末尾，或拖拽到画布中
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

function onDragStart(e: DragEvent, type: FieldType) {
  if (e.dataTransfer) {
    e.dataTransfer.setData('application/x-eas-field-type', type)
    e.dataTransfer.setData('text/plain', type)
    e.dataTransfer.effectAllowed = 'copy'
  }
}
</script>

<template>
  <div class="field-library">
    <div class="panel-title">字段库</div>
    <div class="muted small hint">点击或拖拽添加到表单</div>
    <div class="lib-list">
      <button
        v-for="t in FIELD_TYPES"
        :key="t"
        type="button"
        class="lib-item"
        :disabled="disabled"
        :draggable="!disabled"
        @dragstart="onDragStart($event, t)"
        @click="emit('add', t)"
      >
        <el-icon><component :is="ICONS[t]!" /></el-icon>
        <span>{{ FIELD_TYPE_LABEL[t] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.field-library {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel-title {
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-16);
  font-weight: 600;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
  padding-bottom: 8px;
  border-bottom: 2px dashed var(--eas-rule);
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
  border: 0;
  border-radius: var(--eas-radius-pill);
  background: var(--eas-field);
  color: var(--eas-ink);
  font-size: var(--eas-fs-sm);
  cursor: pointer;
  text-align: left;
  transition:
    background-color var(--eas-dur-fast) var(--eas-ease),
    color var(--eas-dur-fast) var(--eas-ease);
}
.lib-item:hover:not(:disabled) {
  background: var(--eas-row-hover);
  color: var(--eas-primary);
}
.lib-item:focus-visible {
  outline: 2px solid var(--eas-ink);
  outline-offset: 2px;
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
