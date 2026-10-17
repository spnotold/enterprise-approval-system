<script setup lang="ts">
// 单据头：类型与单号（长按复制）、标题、申请人 / 部门 / 时间 / 金额，终态显示一枚章；
// 下方是签批栏，再下方是申请类型、各时间点与来源单 / 后续单。
import { computed } from 'vue'
import type { ApplicationDetail } from '@/lib/types'
import { formatCents } from '@/lib/money'
import SignatureBar from '@/components/SignatureBar.vue'
import Stamp from '@/components/Stamp.vue'
import StatusTag from '@/components/StatusTag.vue'
import { APP_STATUS_LABEL, APP_TYPE_LABEL } from '@/utils/labels'
import { toast } from '@/utils/feedback'
import { goDetail } from '@/utils/nav'
import { fmtDateTime, fmtShort } from '@/utils/time'

const props = defineProps<{
  detail: ApplicationDetail
  /** 本次操作刚处理的节点 seq，签批栏该格播放一次落章动画 */
  stampSeq?: number | null
}>()

const finalStamp = computed(() => {
  if (props.detail.status === 'APPROVED') return { text: '已通过', tone: 'success' as const }
  if (props.detail.status === 'REJECTED') return { text: '已驳回', tone: 'danger' as const }
  return null
})

function copyNo(): void {
  uni.setClipboardData({
    data: props.detail.appNo,
    showToast: false,
    success: () => toast('已复制单号'),
  })
}
</script>

<template>
  <view class="doc">
    <view class="doc-head">
      <view class="doc-id">
        <text class="doc-type">{{ APP_TYPE_LABEL[detail.type] }}</text>
        <text class="doc-no" hover-class="is-pressed" :hover-stay-time="60" @longpress="copyNo">{{ detail.appNo }}</text>
      </view>
      <view v-if="finalStamp" class="doc-stamp">
        <Stamp :text="finalStamp.text" :tone="finalStamp.tone" />
      </view>
      <StatusTag v-else :status="detail.status" />
    </view>

    <view class="doc-title">{{ detail.title || detail.templateName }}</view>

    <view class="doc-meta">
      <view class="meta-item">
        <text class="meta-label">申请人</text>
        <text class="meta-value">{{ detail.applicant.realName }}</text>
      </view>
      <view v-if="detail.deptName" class="meta-item">
        <text class="meta-value">{{ detail.deptName }}</text>
      </view>
      <view class="meta-item">
        <text class="meta-label">{{ detail.submittedAt ? '提交于' : '创建于' }}</text>
        <text class="meta-value num">{{ fmtShort(detail.submittedAt ?? detail.createdAt) }}</text>
      </view>
      <view v-if="detail.amountCents !== null" class="meta-item">
        <text class="meta-label">金额</text>
        <text class="meta-value amount">¥{{ formatCents(detail.amountCents) }}</text>
      </view>
    </view>

    <view class="doc-sig">
      <SignatureBar :flow="detail.flow" :stamp-seq="stampSeq" />
    </view>

    <view class="fields">
      <view class="kv">
        <text class="kv-label">申请类型</text>
        <text class="kv-value">{{ detail.templateName }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">创建时间</text>
        <text class="kv-value num">{{ fmtDateTime(detail.createdAt) }}</text>
      </view>
      <view v-if="detail.submittedAt" class="kv">
        <text class="kv-label">提交时间</text>
        <text class="kv-value num">{{ fmtDateTime(detail.submittedAt) }}</text>
      </view>
      <view v-if="detail.finishedAt" class="kv">
        <text class="kv-label">完成时间</text>
        <text class="kv-value num">{{ fmtDateTime(detail.finishedAt) }}</text>
      </view>
      <view v-if="detail.source" class="kv">
        <text class="kv-label">来源单</text>
        <text class="kv-value link" hover-class="is-pressed" :hover-stay-time="60" @tap="goDetail(detail.source.id)">
          {{ detail.source.appNo }}（{{ APP_STATUS_LABEL[detail.source.status] }}）
        </text>
      </view>
      <view v-for="f in detail.followUps" :key="f.id" class="kv">
        <text class="kv-label">后续单</text>
        <text class="kv-value link" hover-class="is-pressed" :hover-stay-time="60" @tap="goDetail(f.id)">
          {{ f.appNo }}（{{ APP_STATUS_LABEL[f.status] }}）
        </text>
      </view>
    </view>
  </view>
</template>

<style scoped src="./fields.css"></style>
<style scoped>
.doc {
  background: var(--eas-surface);
  border: 1rpx solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
  padding: 28rpx 28rpx 8rpx;
  margin-bottom: 24rpx;
}

.doc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  min-height: 56rpx;
}

.doc-id {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.doc-type {
  flex-shrink: 0;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
  margin-right: 20rpx;
}

/* 单号：长按复制，按压时有底色反馈 */
.doc-no {
  padding: 8rpx 8rpx;
  margin: -8rpx 0;
  border-radius: var(--eas-radius-tag);
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.doc-stamp {
  flex-shrink: 0;
  margin: 4rpx 4rpx 0 16rpx;
}

.doc-title {
  margin: 12rpx 0 16rpx;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-lg);
  font-weight: 600;
  line-height: 1.35;
  color: var(--eas-ink);
  word-break: break-all;
}

.doc-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  margin-bottom: 24rpx;
}

.meta-item {
  display: flex;
  align-items: baseline;
  margin: 0 32rpx 8rpx 0;
}

.meta-label {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  margin-right: 10rpx;
}

.meta-value {
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
}

.meta-value.amount {
  font-weight: 600;
}

.doc-sig {
  padding: 24rpx 0;
  border-top: 1rpx solid var(--eas-rule);
}

.fields {
  border-top: 1rpx solid var(--eas-rule);
}
</style>
