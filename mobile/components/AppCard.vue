<script setup lang="ts">
// 申请列表卡片（我的申请 / 本部门申请）
import type { ApplicationSummary } from '@/lib/types'
import { formatCents } from '@/lib/money'
import StatusTag from '@/components/StatusTag.vue'
import { APP_TYPE_LABEL } from '@/utils/labels'
import { fmtShort } from '@/utils/time'

defineProps<{ app: ApplicationSummary; showApplicant?: boolean }>()
</script>

<template>
  <view class="card app-card">
    <view class="row between">
      <view class="row flex1">
        <text class="tag tag-blue">{{ APP_TYPE_LABEL[app.type] }}</text>
        <text class="bold ellipsis">{{ app.title || app.templateName }}</text>
      </view>
      <text v-if="app.amountCents !== null" class="amount">¥{{ formatCents(app.amountCents) }}</text>
    </view>
    <view class="row between app-line">
      <text class="muted ellipsis flex1">{{ app.appNo }} · {{ app.templateName }}</text>
    </view>
    <view class="row between">
      <StatusTag :status="app.status" :node="app.currentNode" />
      <text class="muted">{{ fmtShort(app.submittedAt || app.updatedAt) }}</text>
    </view>
    <view v-if="showApplicant" class="muted app-line">
      申请人：{{ app.applicant.realName }}<text v-if="app.deptName">（{{ app.deptName }}）</text>
    </view>
  </view>
</template>

<style scoped>
.app-line {
  margin: 6rpx 0 10rpx;
}
</style>
