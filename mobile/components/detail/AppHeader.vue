<script setup lang="ts">
// 详情页头部：编号、标题、类型、状态（附当前节点与审批人）、申请人、金额、时间、来源单 / 后续单
import { computed } from 'vue'
import type { ApplicationDetail, CurrentNode } from '@/lib/types'
import { formatCents } from '@/lib/money'
import StatusTag from '@/components/StatusTag.vue'
import { APP_STATUS_LABEL, APP_TYPE_LABEL } from '@/utils/labels'
import { goDetail } from '@/utils/nav'
import { fmtDateTime } from '@/utils/time'

const props = defineProps<{ detail: ApplicationDetail }>()

const currentNode = computed<CurrentNode | null>(() => {
  const d = props.detail
  if (d.status !== 'IN_APPROVAL' || d.currentNodeSeq === null || !d.flow) return null
  const n = d.flow.nodes.find((x) => x.seq === d.currentNodeSeq)
  return n ? { seq: n.seq, name: n.name, assigneeName: n.assignee?.realName ?? null } : null
})

function copyNo(): void {
  uni.setClipboardData({ data: props.detail.appNo })
}
</script>

<template>
  <view class="card">
    <view class="row between">
      <view class="row flex1" @tap="copyNo">
        <text class="tag tag-blue">{{ APP_TYPE_LABEL[detail.type] }}</text>
        <text class="muted ellipsis">{{ detail.appNo }}</text>
      </view>
      <StatusTag :status="detail.status" />
    </view>
    <view class="head-title break">{{ detail.title || detail.templateName }}</view>
    <view v-if="currentNode" class="banner banner-info head-node">
      当前节点：{{ currentNode.name }}<text v-if="currentNode.assigneeName">（{{ currentNode.assigneeName }}）</text>
    </view>
    <view class="kv">
      <text class="kv-label">申请类型</text>
      <text class="kv-value">{{ detail.templateName }}</text>
    </view>
    <view class="kv">
      <text class="kv-label">申请人</text>
      <text class="kv-value">{{ detail.applicant.realName }}<text v-if="detail.deptName">（{{ detail.deptName }}）</text></text>
    </view>
    <view v-if="detail.amountCents !== null" class="kv">
      <text class="kv-label">金额</text>
      <text class="kv-value amount">¥{{ formatCents(detail.amountCents) }}</text>
    </view>
    <view class="kv">
      <text class="kv-label">创建时间</text>
      <text class="kv-value">{{ fmtDateTime(detail.createdAt) }}</text>
    </view>
    <view v-if="detail.submittedAt" class="kv">
      <text class="kv-label">提交时间</text>
      <text class="kv-value">{{ fmtDateTime(detail.submittedAt) }}</text>
    </view>
    <view v-if="detail.finishedAt" class="kv">
      <text class="kv-label">完成时间</text>
      <text class="kv-value">{{ fmtDateTime(detail.finishedAt) }}</text>
    </view>
    <view v-if="detail.source" class="kv">
      <text class="kv-label">来源单</text>
      <text class="kv-value text-primary" @tap="goDetail(detail.source.id)">
        {{ detail.source.appNo }}（{{ APP_STATUS_LABEL[detail.source.status] }}）
      </text>
    </view>
    <view v-for="f in detail.followUps" :key="f.id" class="kv">
      <text class="kv-label">后续单</text>
      <text class="kv-value text-primary" @tap="goDetail(f.id)">{{ f.appNo }}（{{ APP_STATUS_LABEL[f.status] }}）</text>
    </view>
  </view>
</template>

<style scoped>
.head-title {
  font-size: 34rpx;
  font-weight: 600;
  margin: 16rpx 0 12rpx;
}

.head-node {
  margin: 8rpx 0 12rpx;
}
</style>
