<script setup lang="ts">
// 差旅详情：起止时间、“N 天（自然日）/ 实际 H 小时”、同行人员、事后补报标签
import type { TravelView } from '@/lib/types'
import { formatCents } from '@/lib/money'
import AttachmentPicker from '@/components/AttachmentPicker.vue'
import { textOr, transportLabel } from '@/utils/labels'
import { fmtDateTime } from '@/utils/time'

defineProps<{
  data: TravelView
  canReadAttachments: boolean
}>()
</script>

<template>
  <view>
    <view class="panel">
      <view class="panel-title">
        行程信息<text v-if="data.lateReport" class="mark mark-warning">事后补报</text>
      </view>
      <view class="kv">
        <text class="kv-label">行程</text>
        <text class="kv-value">{{ textOr(data.origin) }} → {{ textOr(data.destination) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">开始时间</text>
        <text class="kv-value num">{{ fmtDateTime(data.startTime) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">结束时间</text>
        <text class="kv-value num">{{ fmtDateTime(data.endTime) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">时长</text>
        <text class="kv-value num">
          {{ data.naturalDays === null ? '—' : data.naturalDays + ' 天（自然日）' }}
          <text v-if="data.durationHours"> / 实际 {{ data.durationHours }} 小时</text>
        </text>
      </view>
      <view class="kv">
        <text class="kv-label">交通方式</text>
        <text class="kv-value">{{ transportLabel(data.transport) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">出差事由</text>
        <text class="kv-value">{{ textOr(data.purpose) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">预算</text>
        <text class="kv-value amount">{{ data.budgetCents === null ? '—' : '¥' + formatCents(data.budgetCents) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">同行人员</text>
        <view class="kv-value">
          <text v-if="!data.companions.length">无</text>
          <view v-for="(c, i) in data.companions" :key="i">
            {{ c.userId ? c.userName || '系统用户' : c.name }}
            <text v-if="c.userId && c.deptName" class="companion-note">{{ c.deptName }}</text>
            <text v-if="!c.userId" class="companion-note">非系统用户</text>
          </view>
        </view>
      </view>
    </view>
    <view v-if="canReadAttachments" class="panel">
      <view class="panel-title">附件</view>
      <view class="attach">
        <AttachmentPicker :model-value="data.attachments" ref-type="TRAVEL_ATTACHMENT" readonly />
      </view>
    </view>
  </view>
</template>

<style scoped src="./fields.css"></style>
<style scoped>
.companion-note {
  margin-left: 16rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.attach {
  padding-bottom: 16rpx;
}
</style>
