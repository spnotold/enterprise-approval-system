<script setup lang="ts">
// 签批栏：审批链路画成一排可横向滚动的格子。已办格写处理人、结果章与时间；
// 当前格虚线框 +「处理中」；跳过 / 取消的格子灰字说明；未到的格子留空。
// 点一个格子在下方展开该节点的审批意见，再点一次收起。
import { computed, ref } from 'vue'
import type { FlowNodeView, FlowView } from '@/lib/types'
import { NODE_STATUS_LABEL, TASK_STATUS_LABEL } from '@/utils/labels'
import { fmtDateTime, fmtShort } from '@/utils/time'
import Stamp from '@/components/Stamp.vue'

const props = defineProps<{
  flow: FlowView | null
  /** 本次操作刚处理的节点 seq：该格的章播放一次落章动画 */
  stampSeq?: number | null
}>()

const expanded = ref<number | null>(null)

type CellState = 'done' | 'active' | 'void' | 'waiting'

function stateOf(n: FlowNodeView): CellState {
  if (n.status === 'ACTIVE') return 'active'
  if (n.status === 'APPROVED' || n.status === 'REJECTED') return 'done'
  if (n.status === 'SKIPPED' || n.status === 'CANCELED') return 'void'
  return 'waiting'
}

function toggle(seq: number): void {
  expanded.value = expanded.value === seq ? null : seq
}

/** 已办格写实际处理人；当前格写待处理的人 */
function handlerText(n: FlowNodeView): string {
  if (n.mode === 'SINGLE') return n.assignee?.realName ?? ''
  const acted = n.tasks.filter((t) => t.actedAt && t.status !== 'CANCELED')
  if (stateOf(n) === 'done' && acted.length) return acted.map((t) => t.assignee.realName).join('、')
  const pending = n.tasks.filter((t) => t.status === 'PENDING')
  if (pending.length) return pending.map((t) => t.assignee.realName).join('、')
  return (n.candidates ?? []).map((c) => c.realName).join('、')
}

/** 会签进度：如「会签 1/3」 */
function progressText(n: FlowNodeView): string {
  if (n.mode === 'COUNTERSIGN' && n.requiredCount) return `会签 ${n.approvedCount ?? 0}/${n.requiredCount}`
  if (n.mode === 'OR_SIGN') return '或签'
  return ''
}

const expandedNode = computed<FlowNodeView | null>(() => {
  if (!props.flow || expanded.value === null) return null
  return props.flow.nodes.find((n) => n.seq === expanded.value) ?? null
})
</script>

<template>
  <view v-if="!flow || !flow.nodes.length" class="sig-empty">提交后生成签批栏</view>
  <view v-else class="sig">
    <scroll-view scroll-x class="sig-scroll" :show-scrollbar="false">
      <view class="sig-row">
        <view
          v-for="n in flow.nodes"
          :key="n.seq"
          class="sig-cell"
          :class="[`is-${stateOf(n)}`, { 'is-open': expanded === n.seq, 'is-rejected': n.status === 'REJECTED' }]"
          hover-class="is-pressed"
          :hover-stay-time="60"
          @tap="toggle(n.seq)"
        >
          <text class="sig-name">{{ n.name }}</text>
          <template v-if="stateOf(n) === 'done'">
            <text class="sig-handler">{{ handlerText(n) }}</text>
            <view class="sig-stamp">
              <Stamp
                :text="n.status === 'APPROVED' ? '同意' : '驳回'"
                :tone="n.status === 'APPROVED' ? 'success' : 'danger'"
                size="sm"
                :animate="stampSeq === n.seq"
              />
            </view>
            <text class="sig-time">{{ fmtShort(n.finishedAt) }}</text>
          </template>
          <template v-else-if="stateOf(n) === 'active'">
            <text class="sig-handler">{{ handlerText(n) }}</text>
            <text class="sig-active">处理中</text>
            <text v-if="progressText(n)" class="sig-time">{{ progressText(n) }}</text>
          </template>
          <text v-else-if="stateOf(n) === 'void'" class="sig-void">{{ NODE_STATUS_LABEL[n.status] }}</text>
        </view>
      </view>
    </scroll-view>

    <view v-if="expandedNode" class="sig-detail">
      <view class="sig-detail-head">
        <text class="sig-detail-name">{{ expandedNode.name }}</text>
        <text class="sig-detail-status">{{ NODE_STATUS_LABEL[expandedNode.status] }}</text>
      </view>
      <view v-if="expandedNode.resolveNote" class="sig-detail-note">{{ expandedNode.resolveNote }}</view>
      <view v-if="expandedNode.conditionText" class="sig-detail-note">
        条件：{{ expandedNode.conditionText }}<text v-if="expandedNode.conditionResult === false">（不满足，已跳过）</text>
      </view>
      <view v-if="!expandedNode.tasks.length" class="sig-detail-note">还没有审批意见</view>
      <view v-for="t in expandedNode.tasks" :key="t.id" class="sig-task">
        <view class="sig-task-head">
          <text class="sig-task-who">{{ t.assignee.realName }}</text>
          <text class="sig-task-status" :class="`task-${t.status.toLowerCase()}`">{{ TASK_STATUS_LABEL[t.status] }}</text>
          <text class="sig-task-time">{{ fmtDateTime(t.actedAt ?? t.createdAt) }}</text>
        </view>
        <view v-if="t.comment" class="sig-task-comment">{{ t.comment }}</view>
        <view v-else-if="t.actedAt" class="sig-task-none">未填写意见</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.sig-empty {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.sig-scroll {
  width: 100%;
  white-space: nowrap;
}

.sig-row {
  display: inline-flex;
  padding: 8rpx 8rpx 14rpx 0;
}

.sig-cell {
  flex-shrink: 0;
  width: 232rpx;
  min-height: 184rpx;
  margin-right: 16rpx;
  padding: 16rpx 18rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: var(--eas-tab);
  border-radius: 24rpx;
  white-space: normal;
}

.sig-cell:last-child {
  margin-right: 0;
}

.sig-cell.is-active {
  background: var(--eas-mustard-tint);
  box-shadow: var(--eas-offset-mark);
}

.sig-cell.is-open {
  box-shadow: var(--eas-offset-mark);
}

.sig-cell.is-done {
  background: var(--eas-sage-tint);
}

/* 驳回的节点：铁锈浅底（鼠尾草只表示同意） */
.sig-cell.is-done.is-rejected {
  background: var(--eas-danger-tint);
}

.sig-name {
  max-width: 100%;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--eas-ink-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sig-handler {
  max-width: 100%;
  margin-top: 8rpx;
  font-family: var(--eas-font-display);
  font-size: 36rpx;
  font-weight: 700;
  color: var(--eas-ink);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sig-stamp {
  margin: 8rpx 0 4rpx 2rpx;
}

.sig-time {
  margin-top: auto;
  padding-top: 4rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}

.sig-active {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  font-weight: 600;
  color: var(--eas-primary);
}

.sig-void {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}

.sig-cell.is-void .sig-name,
.sig-cell.is-waiting .sig-name {
  color: var(--eas-ink-3);
}

.sig-detail {
  margin-top: 12rpx;
  padding: 20rpx 24rpx;
  background: var(--eas-paper);
  border-radius: var(--eas-radius-control);
}

.sig-detail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.sig-detail-name {
  font-size: var(--eas-fs-sm);
  font-weight: 600;
  color: var(--eas-ink);
}

.sig-detail-status {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}

.sig-detail-note {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
  word-break: break-all;
}

.sig-task {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid var(--eas-rule);
}

.sig-task-head {
  display: flex;
  align-items: baseline;
}

.sig-task-who {
  font-size: var(--eas-fs-sm);
  font-weight: 600;
  color: var(--eas-ink);
}

.sig-task-status {
  margin-left: 16rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}

.sig-task-status.task-approved {
  color: var(--eas-success);
}

/* 驳回格是铁锈浅底，普通铁锈字不够 4.5:1 */
.sig-task-status.task-rejected {
  color: var(--eas-rust-deep);
}

.sig-task-status.task-pending {
  color: var(--eas-primary);
}

.sig-task-time {
  margin-left: auto;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}

.sig-task-comment {
  margin-top: 8rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
}

.sig-task-none {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}
</style>
