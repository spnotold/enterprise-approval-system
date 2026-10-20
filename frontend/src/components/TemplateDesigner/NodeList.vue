<script setup lang="ts">
// 审批节点列表：按顺序依次审批；上移 / 下移、拖拽重排、添加、删除、选中编辑
import { inject, ref } from 'vue'
import { ArrowDown, ArrowUp, Delete, Plus, WarningFilled } from '@element-plus/icons-vue'
import type { NodeDef } from '@/lib/types'
import { NODE_MODE_LABEL } from '@/lib/labels'
import { MAX_NODES, MIN_NODES, USER_NAMES_KEY, approverRuleText, conditionText, uidOf, type CondVar } from './utils'

const props = withDefaults(
  defineProps<{
    nodes: NodeDef[]
    selected: number | null
    vars: CondVar[]
    readonly?: boolean
    issueCounts?: number[]
    warnCounts?: number[]
  }>(),
  { readonly: false, issueCounts: () => [], warnCounts: () => [] },
)

const emit = defineEmits<{
  select: [index: number]
  move: [index: number, delta: -1 | 1]
  remove: [index: number]
  add: []
  reorder: [from: number, to: number]
}>()

const names = inject(USER_NAMES_KEY, undefined)
const dropTargetIndex = ref<number | null>(null)

function onNodeDragStart(e: DragEvent, index: number) {
  if (props.readonly || !e.dataTransfer) return
  e.dataTransfer.setData('application/x-eas-node-index', String(index))
  e.dataTransfer.setData('text/plain', String(index))
  e.dataTransfer.effectAllowed = 'move'
}

function onNodeDragOver(e: DragEvent, index: number) {
  if (props.readonly) return
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  dropTargetIndex.value = index
}

function onNodeDragLeave(_e: DragEvent, index: number) {
  if (dropTargetIndex.value === index) {
    dropTargetIndex.value = null
  }
}

function onNodeDrop(e: DragEvent, index: number) {
  if (props.readonly) return
  e.preventDefault()
  dropTargetIndex.value = null
  const nodeIndex = e.dataTransfer?.getData('application/x-eas-node-index')
  if (nodeIndex !== undefined && nodeIndex !== '') {
    const from = Number(nodeIndex)
    if (!Number.isNaN(from) && from !== index) {
      emit('reorder', from, index)
    }
  }
}
</script>

<template>
  <div class="node-list">
    <div class="panel-title">
      审批节点
      <span class="muted small" :class="{ 'text-danger': nodes.length < MIN_NODES || nodes.length > MAX_NODES }">
        {{ nodes.length }} / {{ MAX_NODES }}（至少 {{ MIN_NODES }} 个、最多 {{ MAX_NODES }} 个，按顺序依次审批）
      </span>
    </div>
    <el-empty v-if="nodes.length === 0" :image-size="64" description="暂无节点" />
    <div
      v-for="(n, i) in nodes"
      :key="uidOf(n)"
      class="node-card"
      :class="{
        'is-selected': selected === i,
        'has-issue': (issueCounts[i] ?? 0) > 0,
        'is-drop-target': dropTargetIndex === i,
      }"
      :data-path="`nodes[${i}]`"
      :draggable="!readonly"
      role="button"
      tabindex="0"
      @click="emit('select', i)"
      @keydown.enter.self="emit('select', i)"
      @keydown.space.self.prevent="emit('select', i)"
      @dragstart="onNodeDragStart($event, i)"
      @dragover.stop="onNodeDragOver($event, i)"
      @dragleave.stop="onNodeDragLeave($event, i)"
      @drop.stop="onNodeDrop($event, i)"
    >
      <div class="seq">{{ i + 1 }}</div>
      <div class="body">
        <div class="head">
          <span class="name">{{ n.name || '（未命名节点）' }}</span>
          <span class="muted small">{{ n.nodeKey }}</span>
          <el-tag size="small" effect="plain">{{ NODE_MODE_LABEL[n.mode ?? 'SINGLE'] }}</el-tag>
          <el-tag v-if="n.condition" size="small" type="warning" effect="plain">条件</el-tag>
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
              :disabled="i === nodes.length - 1"
              title="下移"
              @click="emit('move', i, 1)"
            />
            <el-button link type="danger" :icon="Delete" title="删除" @click="emit('remove', i)" />
          </span>
        </div>
        <div class="line">审批人：{{ approverRuleText(n.approverRule, n.mode, names) }}</div>
        <div v-if="n.fallbackRule" class="line muted">替代：{{ approverRuleText(n.fallbackRule, n.mode, names) }}</div>
        <div v-if="n.condition" class="line muted">
          条件：{{ conditionText(n.condition, vars) || '（未填写）' }}
        </div>
        <div v-if="n.timeoutHours" class="line muted">超时提醒：{{ n.timeoutHours }} 小时</div>
      </div>
    </div>
    <el-button
      v-if="!readonly"
      :icon="Plus"
      :disabled="nodes.length >= MAX_NODES"
      class="add-btn"
      @click="emit('add')"
    >
      添加节点
    </el-button>
  </div>
</template>

<style scoped>
.node-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.panel-title {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.node-card {
  display: flex;
  gap: 10px;
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
  padding: 10px 12px;
  background: var(--eas-sheet);
  cursor: pointer;
  outline: none;
  transition:
    border-color var(--eas-dur-fast) var(--eas-ease),
    background-color var(--eas-dur-fast) var(--eas-ease);
}
.node-card:hover {
  border-color: var(--eas-primary);
  background: var(--eas-primary-tint);
}
.node-card.is-drop-target {
  border: 2px dashed var(--eas-primary) !important;
  background: var(--eas-primary-tint) !important;
}
.node-card:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.node-card.is-selected {
  border-color: var(--eas-primary);
  box-shadow: 0 0 0 1px var(--eas-primary) inset;
}
.node-card.has-issue {
  border-color: var(--eas-danger);
}
.node-card.has-issue.is-selected {
  box-shadow: 0 0 0 1px var(--eas-danger) inset;
}
.seq {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--eas-primary-tint);
  color: var(--eas-primary);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 24px;
}
.name {
  font-weight: 500;
  word-break: break-all;
}
.line {
  font-size: var(--eas-fs-sm);
  line-height: 1.5;
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
}
.card-actions .el-button + .el-button {
  margin-left: 4px;
}
.add-btn {
  align-self: flex-start;
}
</style>
