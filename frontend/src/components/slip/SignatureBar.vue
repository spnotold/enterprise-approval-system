<script setup lang="ts">
// 签批栏：审批节点共用一行格线；悬停或聚焦时与流转记录联动并显示完整意见。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { FlowNodeView, FlowView, TaskView } from '@/lib/types'
import { fmtDateTime } from '@/lib/datetime'
import Stamp from './Stamp.vue'
import { nodeKeyOf, useSlipHover } from './hover'
import { signatureWaitDays } from './detailPresentation'

const props = withDefaults(
  defineProps<{
    flow: FlowView
    /** 详情页共享时钟，使长时间停留时等待天数继续更新。 */
    now?: number
    /** 是否可看审批意见（关联只读查看时为 false） */
    showComments?: boolean
    /** 刚由本人处理完的待办：它的章播放一次落章动画 */
    freshTaskId?: number | null
  }>(),
  { showComments: true, freshTaskId: null },
)
const emit = defineEmits<{ stamped: [taskId: number]; locate: [key: string] }>()

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
  waitingDays: number | null
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
  return {
    key: nodeKeyOf(node), node, state, rows, pending,
    waitingDays: state === 'active' ? signatureWaitDays(node, pendingTasks, props.now) : null,
    progress, notes,
  }
}

const cells = computed(() => props.flow.nodes.map(toCell))
const hover = useSlipHover()
// 节点消失或签批栏卸载时，清掉它留下的悬停 / 焦点（被移除的格子不会再触发 mouseleave / blur）
watch(cells, (list) => {
  const keys = new Set(list.map((cell) => cell.key))
  hover.release('bar', (key) => keys.has(key))
})
onBeforeUnmount(() => hover.release('bar'))

const popoverFor = (cell: Cell) =>
  props.showComments && (cell.rows.length > 0 || !!cell.node.resolveNote) && (cell.state === 'approved' || cell.state === 'rejected' || cell.state === 'active')

const shortTime = (iso: string | null) => (iso ? fmtDateTime(iso).slice(5) : '')

const scroller = ref<HTMLElement | null>(null)
const currentCellKey = computed(() => cells.value.find((cell) => cell.state === 'active' || cell.state === 'rejected')?.key)
// 格子多、横向溢出时，把当前格滚进可视区（只滚签批栏本身，不带动页面）
async function scrollCurrentIntoView(behavior: 'auto' | 'smooth' = 'smooth') {
  // 在 nextTick 前记下目标，避免瞬时落章消费 freshTaskId 后丢失定位。
  const key = cells.value.find((cell) => cell.rows.some((row) => row.task.id === props.freshTaskId))?.key ?? currentCellKey.value
  await nextTick()
  const box = scroller.value
  const current = box && Array.from(box.querySelectorAll<HTMLElement>('.cell')).find((cell) => cell.dataset.key === key)
  if (!box || !current || box.scrollWidth <= box.clientWidth) return
  const bounds = box.getBoundingClientRect()
  const rect = current.getBoundingClientRect()
  const left = bounds.left + box.clientLeft
  const right = left + box.clientWidth
  let delta = 0
  if (rect.left < left) delta = rect.left - left - 24
  else if (rect.right > right) delta = rect.right - right + 24
  if (!delta) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  box.scrollTo({ left: box.scrollLeft + delta, behavior: reduce ? 'auto' : behavior })
}
onMounted(() => { void scrollCurrentIntoView('auto') })
watch([currentCellKey, () => props.freshTaskId], ([key, fresh], [oldKey, oldFresh]) => {
  // 落章结束（freshTaskId 变回 null）且当前格没变时，不再补一次滚动
  if (fresh == null && oldFresh != null && key === oldKey) return
  void scrollCurrentIntoView()
})

function cellLabel(cell: Cell): string {
  const parts = [cell.node.name]
  if (cell.state === 'active') {
    parts.push(`处理中，待 ${cell.pending.join('、') || '分配'} 处理`)
    if (cell.waitingDays !== null && cell.waitingDays > 0) parts.push(`已等 ${cell.waitingDays} 天`)
  }
  else if (cell.state === 'skipped') parts.push('已跳过')
  else if (cell.state === 'canceled') parts.push('已取消')
  else if (cell.state === 'waiting') parts.push('未到')
  for (const row of cell.rows) parts.push(`${row.task.assignee.realName} ${RESULT_TEXT[row.result]} ${shortTime(row.task.actedAt)}`)
  return parts.join('，')
}
</script>

<template>
  <div ref="scroller" class="signature-bar" :class="{ scrollable: cells.length > 4, 'mobile-scroll': cells.length > 2 }" role="list" aria-label="签批栏">
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
            :data-key="cell.key"
            :class="[cell.state, { linked: hover.key.value === cell.key }]"
            :aria-label="cellLabel(cell)"
            @mouseenter="hover.enter(cell.key, 'bar', 'pointer')"
            @mouseleave="hover.leave(cell.key, 'pointer')"
            @focus="hover.enter(cell.key, 'bar', 'focus')"
            @blur="hover.leave(cell.key, 'focus')"
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
                  @played="emit('stamped', row.task.id)"
                />
                <span v-else class="sign-transfer">已转办</span>
                <span class="sign-time">{{ shortTime(row.task.actedAt) }}</span>
                <span v-if="showComments && row.task.comment" class="sign-comment">{{ row.task.comment }}</span>
              </span>
              <span v-if="cell.state === 'active'" class="pending">
                <span class="pending-who">{{ cell.pending.join('、') || '待分配' }}</span>
                <span class="pending-label">处理中<span v-if="cell.waitingDays !== null && cell.waitingDays > 0">，已等 {{ cell.waitingDays }} 天</span></span>
              </span>
              <span v-else-if="cell.state === 'waiting'" class="aside">未到</span>
              <span v-else-if="cell.state === 'skipped'" class="aside">已跳过</span>
              <span v-else-if="cell.state === 'canceled'" class="aside">已取消</span>
              <span v-if="cell.progress && cell.state !== 'skipped' && cell.state !== 'waiting'" class="aside">{{ cell.progress }}</span>
            </span>
          </button>
        </template>
        <!-- 浮层也算交互范围：鼠标移进来读意见时不关闭 -->
        <div v-if="showComments" class="sign-notes" @mouseenter="hover.enter(cell.key, 'bar', 'pointer')" @mouseleave="hover.leave(cell.key, 'pointer')">
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
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  background: var(--eas-sheet);
  scrollbar-width: thin;
}
.cell-wrap {
  display: flex;
  flex: 1 0 0;
  min-width: 0;
  border-right: 1px solid var(--eas-rule-strong);
}
.cell-wrap:last-child {
  border-right: 0;
}
.signature-bar.scrollable .cell-wrap {
  flex: 0 0 max(200px, 25%);
}
.cell {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 104px;
  padding: 10px 14px 12px;
  border: 0;
  background: var(--eas-sheet);
  color: var(--eas-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--eas-dur-fast) var(--eas-ease);
}
.cell:focus-visible {
  z-index: 1;
}
.cell-name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-12);
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cell-body {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  margin-top: 6px;
}
.sign {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  column-gap: 8px;
}
.sign-who {
  min-width: 0;
  color: var(--eas-ink);
  font-size: var(--eas-fs-nav);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sign-stamp,
.sign-transfer {
  grid-column: 2;
  grid-row: 1 / span 2;
  justify-self: end;
  margin-top: 1px;
}
.sign-transfer {
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-12);
}
.sign-time {
  grid-column: 1;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-12);
  font-variant-numeric: tabular-nums;
}
.sign-comment {
  grid-column: 1 / -1;
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-note);
  line-height: 1.5;
  white-space: pre-wrap;
}
.pending {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pending-who {
  overflow-wrap: anywhere;
  color: var(--eas-ink);
  font-size: var(--eas-fs-nav);
  font-weight: 600;
}
.pending-label {
  color: var(--eas-primary);
  font-size: var(--eas-fs-note);
}
.aside {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-note);
}

/* 共享格线不随状态变化，当前节点在格内描虚线。 */
.cell.active {
  background: var(--eas-primary-tint);
  outline: 1.5px dashed var(--eas-primary);
  outline-offset: -5px;
}
.cell.active .cell-name,
.cell.active .sign-time,
.cell.active .aside {
  color: var(--eas-ink-2);
}
.cell:hover,
.cell.linked {
  background: var(--eas-row-hover);
  box-shadow: inset 0 0 0 2px var(--eas-primary);
}
.cell.active:hover,
.cell.active.linked {
  background: var(--eas-primary-tint);
}
.cell:hover .cell-name,
.cell:hover .sign-time,
.cell:hover .aside,
.cell.linked .cell-name,
.cell.linked .sign-time,
.cell.linked .aside {
  color: var(--eas-ink-2);
}
.cell:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: -3px;
  box-shadow: inset 0 0 0 2px var(--eas-primary);
}
.cell.active:focus-visible {
  outline: 1.5px dashed var(--eas-primary);
  outline-offset: -5px;
}

@media (max-width: 768px) {
  .signature-bar.mobile-scroll .cell-wrap {
    flex: 0 0 200px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cell {
    transition: none;
  }
}
</style>

<style>
.sign-popover.el-popover.el-popper {
  padding: 0;
  border-color: var(--eas-rule);
}
/* 内边距放在内容上，让整个浮层都在 mouseenter / mouseleave 的范围内 */
.sign-notes {
  padding: 12px 14px;
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
