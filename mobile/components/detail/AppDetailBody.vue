<script setup lang="ts">
// 申请详情主体：头部、业务信息、附件（canReadAttachments 时）、流程时间线、审批日志
import type { ApplicationDetail } from '@/lib/types'
import FlowTimeline from '@/components/FlowTimeline.vue'
import LinkedAppCard from '@/components/LinkedAppCard.vue'
import AppHeader from './AppHeader.vue'
import CustomDetail from './CustomDetail.vue'
import ExpenseDetail from './ExpenseDetail.vue'
import LogList from './LogList.vue'
import PurchaseDetail from './PurchaseDetail.vue'
import TravelDetail from './TravelDetail.vue'

defineProps<{ detail: ApplicationDetail }>()
</script>

<template>
  <view>
    <AppHeader :detail="detail" />
    <view v-if="detail.viewMode === 'LINKED'" class="banner banner-info">
      你正在以报销关联单的身份只读查看，仅显示摘要与流程结果，不含业务明细和附件。
    </view>
    <view v-if="detail.viewMode === 'LINKED' && detail.linked" class="card">
      <view class="card-title">申请摘要</view>
      <LinkedAppCard :app="detail.linked" />
    </view>
    <PurchaseDetail v-if="detail.purchase" :data="detail.purchase" :can-read-attachments="detail.canReadAttachments" />
    <TravelDetail v-if="detail.travel" :data="detail.travel" :can-read-attachments="detail.canReadAttachments" />
    <ExpenseDetail v-if="detail.expense" :data="detail.expense" :can-read-attachments="detail.canReadAttachments" />
    <CustomDetail v-if="detail.custom" :data="detail.custom" :can-read-attachments="detail.canReadAttachments" />
    <view class="card">
      <view class="card-title">审批流程</view>
      <FlowTimeline :flow="detail.flow" />
    </view>
    <view v-if="detail.viewMode !== 'LINKED'" class="card">
      <view class="card-title">审批日志</view>
      <LogList :logs="detail.logs" />
    </view>
  </view>
</template>
