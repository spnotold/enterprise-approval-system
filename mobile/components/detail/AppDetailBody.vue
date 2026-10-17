<script setup lang="ts">
// 申请详情主体：单据头（含签批栏）、业务字段、附件（canReadAttachments 时）、流程时间线、审批日志
import type { ApplicationDetail } from '@/lib/types'
import FlowTimeline from '@/components/FlowTimeline.vue'
import LinkedAppCard from '@/components/LinkedAppCard.vue'
import AppHeader from './AppHeader.vue'
import CustomDetail from './CustomDetail.vue'
import ExpenseDetail from './ExpenseDetail.vue'
import LogList from './LogList.vue'
import PurchaseDetail from './PurchaseDetail.vue'
import TravelDetail from './TravelDetail.vue'

defineProps<{
  detail: ApplicationDetail
  /** 本次操作刚处理的节点 seq，签批栏该格播放一次落章动画 */
  stampSeq?: number | null
}>()
</script>

<template>
  <view>
    <AppHeader :detail="detail" :stamp-seq="stampSeq" />
    <view v-if="detail.viewMode === 'LINKED'" class="note note-info">
      你正在以报销关联单的身份只读查看，仅显示摘要与流程结果，不含业务明细和附件。
    </view>
    <view v-if="detail.viewMode === 'LINKED' && detail.linked" class="panel">
      <view class="panel-title">申请摘要</view>
      <LinkedAppCard :app="detail.linked" />
    </view>
    <PurchaseDetail v-if="detail.purchase" :data="detail.purchase" :can-read-attachments="detail.canReadAttachments" />
    <TravelDetail v-if="detail.travel" :data="detail.travel" :can-read-attachments="detail.canReadAttachments" />
    <ExpenseDetail v-if="detail.expense" :data="detail.expense" :can-read-attachments="detail.canReadAttachments" />
    <CustomDetail v-if="detail.custom" :data="detail.custom" :can-read-attachments="detail.canReadAttachments" />
    <view class="panel">
      <view class="panel-title">
        审批流程<text v-if="detail.flow" class="panel-sub">模板 v{{ detail.flow.versionNo }}</text>
      </view>
      <FlowTimeline :flow="detail.flow" />
    </view>
    <view v-if="detail.viewMode !== 'LINKED'" class="panel">
      <view class="panel-title">审批日志</view>
      <LogList :logs="detail.logs" />
    </view>
  </view>
</template>

<style scoped src="./fields.css"></style>
