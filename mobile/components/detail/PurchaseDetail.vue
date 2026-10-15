<script setup lang="ts">
// 采购详情：单一来源红色横幅；明细与报价为卡片；最低价高亮、拟选加粗；未选最低价显示红色标签与理由
import type { PurchaseView } from '@/lib/types'
import { formatCents } from '@/lib/money'
import AttachmentPicker from '@/components/AttachmentPicker.vue'
import { CHANNEL_LABEL, textOr } from '@/utils/labels'

defineProps<{
  data: PurchaseView
  canReadAttachments: boolean
}>()

function copy(text: string): void {
  uni.setClipboardData({ data: text })
}
</script>

<template>
  <view>
    <view v-if="data.singleSource" class="banner banner-danger">
      <view class="bold">单一来源采购</view>
      <view class="break">{{ textOr(data.singleSourceReason, '未填写说明') }}</view>
      <AttachmentPicker
        v-if="canReadAttachments && data.singleSourceAttachments.length"
        :model-value="data.singleSourceAttachments"
        ref-type="SINGLE_SOURCE"
        readonly
      />
    </view>

    <view class="card">
      <view class="card-title">采购信息</view>
      <view class="kv">
        <text class="kv-label">采购事由</text>
        <text class="kv-value">{{ textOr(data.reason) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">预算上限</text>
        <text class="kv-value">{{ data.budgetLimitCents === null ? '—' : '¥' + formatCents(data.budgetLimitCents) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">期望到货</text>
        <text class="kv-value">{{ textOr(data.expectedArrivalDate) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">明细合计</text>
        <text class="kv-value amount">¥{{ formatCents(data.itemsTotalCents) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">拟选金额</text>
        <text class="kv-value amount">
          {{ data.selectedAmountCents === null ? '—' : '¥' + formatCents(data.selectedAmountCents) }}
        </text>
      </view>
    </view>

    <view class="section-title">采购明细（{{ data.items.length }}）</view>
    <view v-for="(it, i) in data.items" :key="i" class="card">
      <view class="row between">
        <text class="bold flex1 ellipsis">{{ i + 1 }}. {{ textOr(it.name) }}</text>
        <text class="amount">{{ it.amountCents === null ? '—' : '¥' + formatCents(it.amountCents) }}</text>
      </view>
      <view class="muted">
        {{ textOr(it.spec, '无规格') }} · {{ textOr(it.quantity, '0') }} {{ textOr(it.unit, '') }} ×
        ¥{{ it.unitPriceCents === null ? '—' : formatCents(it.unitPriceCents) }}
      </view>
      <view v-if="it.remark" class="muted break">备注：{{ it.remark }}</view>
    </view>

    <view class="section-title">报价比较（{{ data.quotes.length }} 家）</view>
    <view
      v-for="(q, i) in data.quotes"
      :key="i"
      class="card quote"
      :class="{ selected: data.selectedQuoteIndex === i, lowest: q.lowest }"
    >
      <view class="row between">
        <view class="row flex1">
          <text class="bold ellipsis">{{ textOr(q.supplierName) }}</text>
          <text class="tag quote-tag">{{ CHANNEL_LABEL[q.channel] }}</text>
          <text v-if="q.lowest" class="tag tag-green">最低价</text>
          <text v-if="data.selectedQuoteIndex === i" class="tag tag-blue">拟选</text>
        </view>
        <text class="amount" :class="{ 'text-success': q.lowest }">
          {{ q.quoteAmountCents === null ? '—' : '¥' + formatCents(q.quoteAmountCents) }}
        </text>
      </view>
      <view v-if="q.url" class="muted break" @tap="copy(q.url)">链接：{{ q.url }}（点击复制）</view>
      <view v-if="q.description" class="muted break">说明：{{ q.description }}</view>
      <AttachmentPicker
        v-if="canReadAttachments && q.attachments.length"
        :model-value="q.attachments"
        ref-type="PURCHASE_QUOTE"
        readonly
      />
    </view>

    <view class="card">
      <view class="card-title">
        采购选择
        <text v-if="data.notLowest" class="tag tag-red">未选最低价</text>
      </view>
      <view class="kv">
        <text class="kv-label">选择理由</text>
        <text class="kv-value">{{ textOr(data.selectionReason) }}</text>
      </view>
      <view v-if="data.notLowest" class="kv">
        <text class="kv-label">未选最低价理由</text>
        <text class="kv-value text-danger">{{ textOr(data.notLowestReason) }}</text>
      </view>
    </view>

    <view v-if="canReadAttachments" class="card">
      <view class="card-title">附件</view>
      <AttachmentPicker :model-value="data.attachments" ref-type="PURCHASE_ATTACHMENT" readonly />
    </view>
  </view>
</template>

<style scoped>
.quote.lowest {
  border-left: 8rpx solid #16a34a;
}

.quote.selected {
  border: 2rpx solid #2f6bff;
}

.quote.selected .bold {
  font-weight: 700;
}

.quote-tag {
  margin-left: 12rpx;
}
</style>
