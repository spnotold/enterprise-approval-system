<script setup lang="ts">
// 申请列表卡片（我的申请 / 本部门申请）：一张单据，类型暗纸标签 + 标题 + 金额展示字
import type { ApplicationSummary } from '@/lib/types'
import { formatCents } from '@/lib/money'
import StatusTag from '@/components/StatusTag.vue'
import { APP_TYPE_LABEL } from '@/utils/labels'
import { fmtShort } from '@/utils/time'

defineProps<{ app: ApplicationSummary; showApplicant?: boolean; flush?: boolean }>()
</script>

<template>
  <view class="card app-card" :class="{ 'app-card--flush': flush }" hover-class="is-pressed" hover-stay-time="60">
    <view class="row between">
      <view class="row flex1">
        <text class="tag">{{ APP_TYPE_LABEL[app.type] }}</text>
        <text class="title ellipsis">{{ app.title || app.templateName }}</text>
      </view>
      <text v-if="app.amountCents !== null" class="amount card-amount">¥{{ formatCents(app.amountCents) }}</text>
    </view>
    <view class="line muted">
      <text class="ellipsis app-no">{{ app.appNo }}</text>
      <text v-if="showApplicant" class="applicant">{{ app.applicant.realName }}<text v-if="app.deptName">（{{ app.deptName }}）</text></text>
    </view>
    <view class="row between last-line">
      <StatusTag :status="app.status" :node="app.currentNode" />
      <text class="muted">{{ fmtShort(app.submittedAt || app.updatedAt) }}</text>
    </view>
  </view>
</template>

<style scoped>
/* 嵌在 SwipeCell 里时由外层负责间距，单据的纸影落在 SwipeCell 的内边距里 */
.app-card--flush { margin: 0; }

.title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: var(--eas-ink);
}

.card-amount {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 30rpx;
}

.applicant { margin-left: 16rpx; }

.app-no { margin-right: 4rpx; }

.line {
  margin-top: 14rpx;
}

.last-line {
  margin-top: 14rpx;
  min-height: 44rpx;
}
</style>
