<script setup lang="ts">
// 签批栏：每个审批节点一格。已办格写处理人、结果章与时间；当前格虚线框 +「处理中」与待处理人；未到的格子留空。
// 悬停或聚焦某格时，与下方流转记录联动，并弹出该节点的审批意见。
import { computed, nextTick, onMounted, ref } from 'vue'
import type { FlowNodeView, FlowView, TaskView } from '@/lib/types'
import { fmtDateTime } from '@/lib/datetime'
import Stamp from './Stamp.vue'
import { nodeKeyOf, useSlipHover } from './hover'

const props = withDefaults(
  defineProps<{
    flow: FlowView
    /** 是否可看审批意见（关联只读查看时为 false） */
    showComments?: boolean
    /** 刚由本人处理完的待办：它的章播放一次落章动画 */
    freshTaskId?: number | null
  }>(),
  { showComments: true, freshTaskId: null },
)
const emit = defineEmits<{ stamped: []; locate: [key: string] }>()

type CellState = 'approved' | 'rejected' | 'active' | 'waiting' | 'skipped' | 'canceled'
interface SignRow {
  task: TaskView
  result: 'approve' | 'reject' | 'transfer'
}
interface Cell {
  key: string
  node: FlowNodeView
  state: CellState
  rows: SignRow[]
  pending: string[]
  progress: string | null
  notes: { who: string; label: string; text: string; reject: boolean }[]
}

const STATE: Record<FlowNodeView['status'], CellState> = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ACTIVE: 'active',
  WAITING: 'waiting',
  NOT_REACHED: 'waiting',
  SKIPPED: 'skipped',
  CANCELED: 'canceled',
}
const RESULT_TEXT = { approve: '同意', reject: '驳回', transfer: '转办' } as const

function toCell(node: FlowNodeView): Cell {
  const state: CellState = !node.effective ? 'skipped' : STATE[node.status] ?? 'waiting'
  const rows: SignRow[] = []
  for (const task of node.tasks) {
    if (task.status === 'APPROVED') rows.push({ task, result: 'approve' })
    else if (task.status === 'REJECTED') rows.push({ task, result: 'reject' })
    else if (task.status === 'TRANSFERRED') rows.push({ task, result: 'transfer' })
  }
  rows.sort((a, b) => Date.parse(a.task.actedAt ?? a.task.createdAt) - Date.parse(b.task.actedAt ?? b.task.createdAt))
  const pendingTasks = node.tasks.filter((task) => task.status === 'PENDING')
  const fallback = node.candidates.length ? node.candidates : node.assignee ? [node.assignee] : []
  const pending = state === 'active' ? (pendingTasks.length ? pendingTasks.map((t) => t.assignee) : fallback).map((u) => u.realName) : []
  const progress =
    node.mode === 'COUNTERSIGN'
      ? `会签 ${node.approvedCount ?? 0}/${node.requiredCount || node.candidates.length || 0}`
      : node.mode === 'OR_SIGN'
        ? `或签 ${node.candidates.length} 人任一`
        : null
  const notes = rows
    .filter((row) => row.task.comment)
    .map((row) => ({
      who: row.task.assignee.realName,
      label: row.result === 'reject' ? '驳回理由' : row.result === 'transfer' ? '转办说明' : '意见',
      text: row.task.comment ?? '',
      reject: row.result === 'reject',
    }))
  return { key: nodeKeyOf(node), node, state, rows, pending, progress, notes }
}

const cells = computed(() => props.flow.nodes.map(toCell))
const hover = useSlipHover()

const popoverFor = (cell: Cell) =>
  props.showComments && (cell.rows.length > 0 || !!cell.node.resolveNote) && (cell.state === 'approved' || cell.state === 'rejected' || cell.state === 'active')

const shortTime = (iso: string | null) => (iso ? fmtDateTime(iso).slice(5) : '')

const scroller = ref<HTMLElement | null>(null)
// 格子多、横向溢出时，把当前格滚进可视区（只滚签批栏本身，不带动页面）
onMounted(() => {
  void nextTick(() => {
    const box = scroller.value
    const current = box?.querySelector<HTMLElement>('.cell.active, .cell.rejected')
    if (!box || !current || box.scrollWidth <= box.clientWidth) return
    const offset = current.offsetLeft - box.offsetLeft
    if (offset + current.offsetWidth > box.clientWidth) box.scrollLeft = offset - 24
  })
})

function cellLabel(cell: Cell): string {
  const parts = [cell.node.name]
  if (cell.state === 'active') parts.push(`处理中，待 ${cell.pending.join('、') || '分配'} 处理`)
  else if (cell.state === 'skipped') parts.push('已跳过')
  else if (cell.state === 'canceled') parts.push('已取消')
  else if (cell.state === 'waiting') parts.push('未到达')
  for (const row of cell.rows) parts.push(`${row.task.assignee.realName} ${RESULT_TEXT[row.result]} ${shortTime(row.task.actedAt)}`)
  return parts.join('，')
}
</script>

<template>
  <div ref="scroller" class="signature-bar" role="list" aria-label="签批栏">
    <div v-for="cell in cells" :key="cell.key" role="listitem" class="cell-wrap">
      <el-popover
        :visible="popoverFor(cell) && hover.key.value === cell.key && hover.source.value === 'bar'"
        placement="bottom-start"
        :width="300"
        :show-arrow="false"
        :offset="6"
        popper-class="sign-popover"
      >
        <template #reference>
          <button
            type="button"
            class="cell"
            :class="[cell.state, { linked: hover.key.value === cell.key }]"
            :aria-label="cellLabel(cell)"
            @mouseenter="hover.enter(cell.key, 'bar')"
            @mouseleave="hover.leave(cell.key)"
            @focus="hover.enter(cell.key, 'bar')"
            @blur="hover.leave(cell.key)"
            @click="emit('locate', cell.key)"
          >
            <span class="cell-name">{{ cell.node.name }}</span>
            <span class="cell-body">
              <span v-for="row in cell.rows" :key="row.task.id" class="sign" :class="{ transfer: row.result === 'transfer' }">
                <span class="sign-who">{{ row.task.assignee.realName }}</span>
                <Stamp
                  v-if="row.result !== 'transfer'"
                  :tone="row.result === 'approve' ? 'success' : 'danger'"
                  :text="RESULT_TEXT[row.result]"
                  :animate="row.task.id === freshTaskId"
                  class="sign-stamp"
                  @played="emit('stamped')"
                />
                <span v-else class="sign-transfer">已转办</span>
                <span class="sign-time">{{ shortTime(row.task.actedAt) }}</span>
              </span>
              <span v-if="cell.state === 'active'" class="pending">
                <span class="pending-label">处理中</span>
                <span class="pending-who">{{ cell.pending.join('、') || '待分配' }}</span>
              </span>
              <span v-else-if="cell.state === 'skipped'" class="aside">已跳过</span>
              <span v-else-if="cell.state === 'canceled'" class="aside">已取消</span>
              <span v-if="cell.progress && cell.state !== 'skipped' && cell.state !== 'waiting'" class="aside">{{ cell.progress }}</span>
            </span>
          </button>
        </template>
        <div class="sign-notes">
          <div class="sign-notes-title">{{ cell.node.name }}</div>
          <p v-if="cell.node.resolveNote" class="sign-note-resolve">{{ cell.node.resolveNote }}</p>
          <template v-if="cell.notes.length">
            <p v-for="(note, index) in cell.notes" :key="index" class="sign-note pre-wrap" :class="{ reject: note.reject }">
              <span class="sign-note-who">{{ note.who }} {{ note.label }}</span>{{ note.text }}
            </p>
          </template>
          <p v-else-if="cell.rows.length" class="sign-note-empty">未填写审批意见</p>
        </div>
      </el-popover>
    </div>
  </div>
</template>

<style scoped>
.signature-bar {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  /* 顶部留出节点名压线的位置 */
  padding: 10px 2px 6px;
  scrollbar-width: thin;
}
.cell-wrap {
  display: flex;
  flex: none;
}
.cell {
  --cell-bg: var(--eas-surface);
  position: relative;
  display: flex;
  flex-direction: column;
  width: 184px;
  min-height: 92px;
  padding: 16px 12px 10px;
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  background: var(--cell-bg);
  color: var(--eas-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--eas-dur-fast) var(--eas-ease),
    background-color var(--eas-dur-fast) var(--eas-ease);
}
.cell:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
/* 节点名压在格子顶边上，像单据上印好的栏目名 */
.cell-name {
  position: absolute;
  top: -9px;
  left: 8px;
  max-width: calc(100% - 16px);
  padding: 0 4px;
  overflow: hidden;
  background: linear-gradient(to bottom, var(--eas-surface) 50%, var(--cell-bg) 50%);
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-xs);
  line-height: 18px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cell-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.sign {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 8px;
}
.sign-who {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sign-stamp,
.sign-transfer {
  grid-row: span 2;
}
.sign-transfer {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
}
.sign.transfer .sign-who {
  font-weight: 400;
  color: var(--eas-ink-2);
}
.sign-time {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
  font-variant-numeric: tabular-nums;
}
.pending {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pending-label {
  color: var(--eas-primary);
  font-size: var(--eas-fs-xs);
  font-weight: 600;
}
.pending-who {
  font-weight: 600;
}
.aside {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
}

/* 状态 */
.cell.active {
  --cell-bg: var(--eas-primary-tint);
  border: 1px dashed var(--eas-primary);
}
.cell.active .cell-name {
  color: var(--eas-primary);
  font-weight: 600;
}
.cell.waiting .cell-name,
.cell.skipped .cell-name,
.cell.canceled .cell-name {
  color: var(--eas-ink-3);
}
.cell.skipped,
.cell.canceled {
  border-color: var(--eas-rule);
}

/* 与流转记录联动 */
.cell:hover,
.cell.linked {
  border-color: var(--eas-primary);
}
.cell.waiting.linked,
.cell.skipped.linked,
.cell.canceled.linked,
.cell.approved.linked,
.cell.rejected.linked {
  --cell-bg: var(--eas-paper);
}

@media (max-width: 768px) {
  .cell {
    width: 160px;
  }
}
</style>

<style>
.sign-popover.el-popover.el-popper {
  padding: 12px 14px;
  border-color: var(--eas-rule);
}
.sign-notes-title {
  margin-bottom: 6px;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-xs);
}
.sign-notes p {
  margin: 0;
  line-height: 1.6;
}
.sign-notes p + p {
  margin-top: 6px;
}
.sign-note-who {
  margin-right: 8px;
  color: var(--eas-ink-2);
}
.sign-note.reject {
  color: var(--eas-danger);
}
.sign-note-resolve {
  color: var(--eas-warning-text);
  font-size: var(--eas-fs-xs);
}
.sign-note-empty {
  color: var(--eas-ink-3);
}
</style>
