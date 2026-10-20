<script setup lang="ts">
// 表单画布：字段列表（静态预览），选中、上移 / 下移、拖拽重排、删除
import { ref } from 'vue'
import { ArrowDown, ArrowUp, Calendar, Delete, Upload, WarningFilled } from '@element-plus/icons-vue'
import type { FieldType, FormField } from '@/lib/types'
import { FIELD_TYPE_LABEL } from '@/lib/labels'
import { uidOf } from './utils'

const props = withDefaults(
  defineProps<{
    fields: FormField[]
    selected: number | null
    readonly?: boolean
    /** 每个字段的服务端校验问题数 */
    issueCounts?: number[]
    /** 每个字段的本地待完善项数 */
    warnCounts?: number[]
    emptyText?: string
  }>(),
  { readonly: false, issueCounts: () => [], warnCounts: () => [], emptyText: '暂无字段，点击左侧字段库添加' },
)

const emit = defineEmits<{
  select: [index: number]
  move: [index: number, delta: -1 | 1]
  remove: [index: number]
  reorder: [from: number, to: number]
  dropType: [type: FieldType, targetIndex?: number]
}>()

const dropTargetIndex = ref<number | null>(null)
const isCanvasOver = ref(false)

function onCardDragStart(e: DragEvent, index: number) {
  if (props.readonly || !e.dataTransfer) return
  e.dataTransfer.setData('application/x-eas-field-index', String(index))
  e.dataTransfer.setData('text/plain', String(index))
  e.dataTransfer.effectAllowed = 'move'
}

function onCardDragOver(e: DragEvent, index: number) {
  if (props.readonly) return
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-eas-field-type') ? 'copy' : 'move'
  }
  dropTargetIndex.value = index
}

function onCardDragLeave(_e: DragEvent, index: number) {
  if (dropTargetIndex.value === index) {
    dropTargetIndex.value = null
  }
}

function onCardDrop(e: DragEvent, index: number) {
  if (props.readonly) return
  e.preventDefault()
  dropTargetIndex.value = null
  isCanvasOver.value = false
  const fieldType = e.dataTransfer?.getData('application/x-eas-field-type') as FieldType | undefined
  const fieldIndex = e.dataTransfer?.getData('application/x-eas-field-index')
  if (fieldType) {
    emit('dropType', fieldType, index)
  } else if (fieldIndex !== undefined && fieldIndex !== '') {
    const from = Number(fieldIndex)
    if (!Number.isNaN(from) && from !== index) {
      emit('reorder', from, index)
    }
  }
}

function onCanvasDragOver(e: DragEvent) {
  if (props.readonly) return
  e.preventDefault()
  isCanvasOver.value = true
}

function onCanvasDragLeave(_e: DragEvent) {
  isCanvasOver.value = false
}

function onCanvasDrop(e: DragEvent) {
  if (props.readonly) return
  e.preventDefault()
  isCanvasOver.value = false
  dropTargetIndex.value = null
  const fieldType = e.dataTransfer?.getData('application/x-eas-field-type') as FieldType | undefined
  if (fieldType) {
    emit('dropType', fieldType)
  }
}
</script>

<template>
  <div
    class="form-canvas"
    :class="{ 'is-drop-active': isCanvasOver && fields.length === 0 }"
    @dragover="onCanvasDragOver"
    @dragleave="onCanvasDragLeave"
    @drop="onCanvasDrop"
  >
    <div class="panel-title">
      表单画布
      <span class="muted small">共 {{ fields.length }} 个字段</span>
    </div>
    <el-empty v-if="fields.length === 0" :image-size="64" :description="emptyText" />
    <div
      v-for="(f, i) in fields"
      :key="uidOf(f)"
      class="field-card"
      :class="{
        'is-selected': selected === i,
        'has-issue': (issueCounts[i] ?? 0) > 0,
        'is-drop-target': dropTargetIndex === i,
      }"
      :data-path="`fields[${i}]`"
      :draggable="!readonly"
      role="button"
      tabindex="0"
      @click="emit('select', i)"
      @keydown.enter.self="emit('select', i)"
      @keydown.space.self.prevent="emit('select', i)"
      @dragstart="onCardDragStart($event, i)"
      @dragover.stop="onCardDragOver($event, i)"
      @dragleave.stop="onCardDragLeave($event, i)"
      @drop.stop="onCardDrop($event, i)"
    >
      <div class="card-head">
        <el-tag size="small" effect="plain">{{ FIELD_TYPE_LABEL[f.type] ?? f.type }}</el-tag>
        <span class="label">
          <span v-if="f.required" class="req">*</span>{{ f.label || '（未命名）' }}
        </span>
        <span class="muted small key">{{ f.key || '—' }}</span>
        <el-tag v-if="f.type === 'AMOUNT' && f.statAmount" size="small" type="success">统计金额</el-tag>
        <el-badge v-if="(issueCounts[i] ?? 0) > 0" :value="issueCounts[i]" type="danger" class="issue-badge" />
        <el-tooltip v-else-if="(warnCounts[i] ?? 0) > 0" :content="`有 ${warnCounts[i]} 处待完善`" placement="top">
          <el-icon class="warn-icon"><WarningFilled /></el-icon>
        </el-tooltip>
        <span class="flex-1" />
        <span v-if="!readonly" class="card-actions" @click.stop>
          <el-button link :icon="ArrowUp" :disabled="i === 0" title="上移" @click="emit('move', i, -1)" />
          <el-button
            link
            :icon="ArrowDown"
            :disabled="i === fields.length - 1"
            title="下移"
            @click="emit('move', i, 1)"
          />
          <el-button link type="danger" :icon="Delete" title="删除" @click="emit('remove', i)" />
        </span>
      </div>
      <!-- 静态预览，不可交互 -->
      <div class="preview" aria-hidden="true">
        <el-input
          v-if="f.type === 'TEXT'"
          size="small"
          disabled
          :placeholder="f.placeholder || '请输入'"
        />
        <el-input
          v-else-if="f.type === 'TEXTAREA'"
          type="textarea"
          :rows="2"
          size="small"
          disabled
          :placeholder="f.placeholder || '请输入'"
        />
        <el-input
          v-else-if="f.type === 'NUMBER'"
          size="small"
          disabled
          :placeholder="f.placeholder || '请输入数字'"
        />
        <el-input v-else-if="f.type === 'AMOUNT'" size="small" disabled :placeholder="f.placeholder || '0.00'">
          <template #prefix>¥</template>
        </el-input>
        <el-input
          v-else-if="f.type === 'DATE'"
          size="small"
          disabled
          :prefix-icon="Calendar"
          :placeholder="f.placeholder || '选择日期'"
        />
        <el-radio-group v-else-if="f.type === 'RADIO'" size="small" disabled :model-value="''">
          <el-radio v-for="(o, k) in f.options ?? []" :key="k" :value="o.value">{{ o.label || o.value }}</el-radio>
          <span v-if="!(f.options ?? []).length" class="muted small">（尚无选项）</span>
        </el-radio-group>
        <el-button v-else-if="f.type === 'ATTACHMENT'" size="small" disabled :icon="Upload">上传附件</el-button>
        <div v-if="f.help" class="muted small help">{{ f.help }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-canvas {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  transition:
    border-color var(--eas-dur-fast) var(--eas-ease),
    background-color var(--eas-dur-fast) var(--eas-ease);
}
.form-canvas.is-drop-active {
  border: 2px dashed var(--eas-primary);
  background: var(--eas-primary-tint);
  border-radius: var(--eas-radius-panel);
}
.panel-title {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.field-card {
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
  padding: 10px 12px;
  background: var(--eas-sheet);
  cursor: pointer;
  transition:
    border-color var(--eas-dur-fast) var(--eas-ease),
    background-color var(--eas-dur-fast) var(--eas-ease);
  outline: none;
}
.field-card:hover {
  border-color: var(--eas-primary);
  background: var(--eas-primary-tint);
}
.field-card.is-drop-target {
  border: 2px dashed var(--eas-primary) !important;
  background: var(--eas-primary-tint) !important;
}
.field-card:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.field-card.is-selected {
  border-color: var(--eas-primary);
  box-shadow: 0 0 0 1px var(--eas-primary) inset;
}
.field-card.has-issue {
  border-color: var(--eas-danger);
}
.field-card.has-issue.is-selected {
  box-shadow: 0 0 0 1px var(--eas-danger) inset;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  flex-wrap: wrap;
}
.label {
  font-weight: 500;
  word-break: break-all;
}
.req {
  color: var(--eas-danger);
  margin-right: 2px;
}
.key {
  word-break: break-all;
}
.issue-badge :deep(.el-badge__content) {
  position: static;
  transform: none;
}
.warn-icon {
  color: var(--eas-warning);
}
.card-actions {
  display: inline-flex;
  gap: 0;
}
.card-actions .el-button + .el-button {
  margin-left: 4px;
}
.preview {
  margin-top: 8px;
  pointer-events: none;
}
.help {
  margin-top: 4px;
}
</style>
