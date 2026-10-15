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
    <view class="row between">
      <view class="row flex1">
        <text class="tag tag-blue">{{ APP_TYPE_LABEL[app.type] }}</text>
        <text class="bold ellipsis">{{ app.title || app.appNo }}</text>
      </view>
      <uni-icons v-if="selected" type="checkbox-filled" size="22" color="#2f6bff" />
    </view>
    <view class="muted">{{ app.appNo }}<text v-if="app.finishedAt"> · {{ fmtDate(app.finishedAt) }} 通过</text></view>
    <view v-if="app.travel" class="muted">
      {{ textOr(app.travel.origin) }} → {{ textOr(app.travel.destination) }}，
      {{ fmtDate(app.travel.startTime) }} 至 {{ fmtDate(app.travel.endTime) }}，
      {{ app.travel.naturalDays ?? '—' }} 天，预算
      {{ app.travel.budgetCents === null ? '—' : '¥' + formatCents(app.travel.budgetCents) }}
    </view>
    <view v-if="app.purchase" class="muted">
      供应商 {{ textOr(app.purchase.selectedSupplier) }}，金额
      {{ app.purchase.selectedAmountCents === null ? '—' : '¥' + formatCents(app.purchase.selectedAmountCents) }}，
      {{ app.purchase.itemCount }} 项明细
    </view>
  </view>
</template>

<style scoped>
.link-card {
  padding: 20rpx 24rpx;
  border-radius: 12rpx;
  background: #f7f8fa;
  border: 2rpx solid transparent;
  margin-bottom: 16rpx;
}

.link-card.selected {
  border-color: #2f6bff;
  background: #f0f5ff;
}
</style>
