<script setup lang="ts">
// 报销关联申请的摘要卡片：单据样式（纸色 + 硬投影），选中时垫芥黄错版
// 差旅显示目的地、起止时间、天数、预算；采购显示供应商、金额、明细数
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
    <view class="row">
      <text class="tag">{{ APP_TYPE_LABEL[app.type] }}</text>
      <text class="link-title ellipsis">{{ app.title || app.appNo }}</text>
      <view v-if="selected" class="link-check" />
    </view>
    <view class="link-meta">
      <text class="link-no">{{ app.appNo }}</text>
      <text v-if="app.finishedAt">{{ fmtDate(app.finishedAt) }} 通过</text>
    </view>
    <!-- 全角标点后不加空格；word-break: keep-all 让「预算」等词不被拆行 -->
    <view v-if="app.travel" class="link-text">{{ textOr(app.travel.origin) }} → {{ textOr(app.travel.destination) }}，{{ fmtDate(app.travel.startTime) }} 至 {{ fmtDate(app.travel.endTime) }}，{{ app.travel.naturalDays ?? '—' }} 天，预算 {{ app.travel.budgetCents === null ? '—' : '¥' + formatCents(app.travel.budgetCents) }}</view>
    <view v-if="app.purchase" class="link-text">供应商 {{ textOr(app.purchase.selectedSupplier) }}，金额 {{ app.purchase.selectedAmountCents === null ? '—' : '¥' + formatCents(app.purchase.selectedAmountCents) }}，{{ app.purchase.itemCount }} 项明细</view>
  </view>
</template>

<style scoped>
/* 单据：嵌在 sheet 底的 .panel 里，用 field 纸（更亮一档）与面板拉开层次；硬投影，不描边；右、下留 8rpx 给投影 */
.link-card {
  padding: 24rpx 28rpx;
  margin: 0 8rpx 20rpx 0;
  background: var(--eas-field);
  border-radius: var(--eas-radius-panel);
  box-shadow: var(--eas-shadow-sheet);
}

/* 选中：芥黄错版（选中 / 聚焦的专用记号） */
.link-card.selected {
  box-shadow: var(--eas-offset-mark);
}

.link-title {
  flex: 1;
  min-width: 0;
  font-size: var(--eas-fs-sm);
  font-weight: 600;
  color: var(--eas-ink);
}

/* 选中对勾 */
.link-check {
  flex-shrink: 0;
  width: 14rpx;
  height: 26rpx;
  margin: 0 8rpx 0 16rpx;
  border-bottom: 4rpx solid var(--eas-ink);
  border-right: 4rpx solid var(--eas-ink);
  transform: rotate(45deg);
}

.link-meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: 12rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}

.link-no {
  margin-right: 24rpx;
}

.link-text {
  margin-top: 10rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
  line-height: 1.6;
  word-break: keep-all;
  font-variant-numeric: tabular-nums;
}
</style>
