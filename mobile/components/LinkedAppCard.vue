<script setup lang="ts">
// 报销关联申请的摘要卡片：差旅显示目的地、起止时间、天数、预算；采购显示供应商、金额、明细数
import type { LinkableApplication } from '@/lib/types'
import { formatCents } from '@/lib/money'
import { APP_TYPE_LABEL, textOr } from '@/utils/labels'
import { fmtDate } from '@/utils/time'

defineProps<{
  app: LinkableApplication
  selected?: boolean
}>()
</script>

<template>
  <view class="link-card" :class="{ selected }">
    <view class="link-head">
      <text class="link-type">{{ APP_TYPE_LABEL[app.type] }}</text>
      <text class="link-title">{{ app.title || app.appNo }}</text>
      <view v-if="selected" class="link-check" />
    </view>
    <view class="link-meta">
      <text class="link-no">{{ app.appNo }}</text>
      <text v-if="app.finishedAt">{{ fmtDate(app.finishedAt) }} 通过</text>
    </view>
    <view v-if="app.travel" class="link-text">
      {{ textOr(app.travel.origin) }} → {{ textOr(app.travel.destination) }}，
      {{ fmtDate(app.travel.startTime) }} 至 {{ fmtDate(app.travel.endTime) }}，
      {{ app.travel.naturalDays ?? '—' }} 天，预算
      {{ app.travel.budgetCents === null ? '—' : '¥' + formatCents(app.travel.budgetCents) }}
    </view>
    <view v-if="app.purchase" class="link-text">
      供应商 {{ textOr(app.purchase.selectedSupplier) }}，金额
      {{ app.purchase.selectedAmountCents === null ? '—' : '¥' + formatCents(app.purchase.selectedAmountCents) }}，
      {{ app.purchase.itemCount }} 项明细
    </view>
  </view>
</template>

<style scoped>
.link-card {
  padding: 20rpx 24rpx;
  margin-bottom: 16rpx;
  background: var(--eas-paper);
  border: 2rpx solid transparent;
  border-radius: var(--eas-radius-control);
}

.link-card.selected {
  background: var(--eas-primary-tint);
  border-color: var(--eas-primary);
}

.link-head {
  display: flex;
  align-items: baseline;
}

.link-type {
  flex-shrink: 0;
  margin-right: 16rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}

.link-title {
  flex: 1;
  min-width: 0;
  font-size: var(--eas-fs-sm);
  font-weight: 600;
  color: var(--eas-ink);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 选中对勾 */
.link-check {
  flex-shrink: 0;
  width: 14rpx;
  height: 26rpx;
  margin: 0 8rpx 0 16rpx;
  border-bottom: 4rpx solid var(--eas-primary);
  border-right: 4rpx solid var(--eas-primary);
  transform: rotate(45deg);
}

.link-meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: 6rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}

.link-no {
  margin-right: 24rpx;
}

.link-text {
  margin-top: 6rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}
</style>
