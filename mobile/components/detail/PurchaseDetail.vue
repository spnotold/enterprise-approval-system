<script setup lang="ts">
// 采购详情：单一来源提示；明细与报价在同一面板内逐行排布；最低价、拟选用描边小标记；
// 未选最低价时显示标记与理由
import type { PurchaseView } from '@/lib/types'
import { formatCents } from '@/lib/money'
import AttachmentPicker from '@/components/AttachmentPicker.vue'
import { CHANNEL_LABEL, textOr } from '@/utils/labels'
import { toast } from '@/utils/feedback'

defineProps<{
  data: PurchaseView
  canReadAttachments: boolean
}>()

function copy(text: string): void {
  uni.setClipboardData({ data: text, showToast: false, success: () => toast('已复制链接') })
}

function money(cents: number | null): string {
  return cents === null ? '—' : '¥' + formatCents(cents)
}
</script>

<template>
  <view>
    <view v-if="data.singleSource" class="note note-danger">
      <view class="note-title">单一来源采购</view>
      <view class="break">{{ textOr(data.singleSourceReason, '未填写说明') }}</view>
      <AttachmentPicker
        v-if="canReadAttachments && data.singleSourceAttachments.length"
        :model-value="data.singleSourceAttachments"
        ref-type="SINGLE_SOURCE"
        readonly
      />
    </view>

    <view class="panel">
      <view class="panel-title">采购信息</view>
      <view class="kv">
        <text class="kv-label">采购事由</text>
        <text class="kv-value">{{ textOr(data.reason) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">预算上限</text>
        <text class="kv-value num">{{ money(data.budgetLimitCents) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">期望到货</text>
        <text class="kv-value num">{{ textOr(data.expectedArrivalDate) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">明细合计</text>
        <text class="kv-value amount">¥{{ formatCents(data.itemsTotalCents) }}</text>
      </view>
      <view class="kv">
        <text class="kv-label">拟选金额</text>
        <text class="kv-value amount">{{ money(data.selectedAmountCents) }}</text>
      </view>
    </view>

    <view class="panel">
      <view class="panel-title">采购明细<text class="panel-sub">{{ data.items.length }} 项</text></view>
      <view v-for="(it, i) in data.items" :key="i" class="line">
        <view class="line-main">
          <text class="line-name">{{ textOr(it.name) }}</text>
          <text class="line-amount">{{ money(it.amountCents) }}</text>
        </view>
        <view class="line-meta">
          <text class="line-meta-item">{{ textOr(it.spec, '无规格') }}</text>
          <text class="line-meta-item">
            {{ textOr(it.quantity, '0') }} {{ textOr(it.unit, '') }} × ¥{{ it.unitPriceCents === null ? '—' : formatCents(it.unitPriceCents) }}
          </text>
        </view>
        <view v-if="it.remark" class="line-note">备注：{{ it.remark }}</view>
      </view>
    </view>

    <view class="panel">
      <view class="panel-title">报价比较<text class="panel-sub">{{ data.quotes.length }} 家</text></view>
      <view v-for="(q, i) in data.quotes" :key="i" class="line quote" :class="{ selected: data.selectedQuoteIndex === i }">
        <view class="line-main">
          <view class="quote-name">
            <text class="line-name">{{ textOr(q.supplierName) }}</text>
            <text v-if="data.selectedQuoteIndex === i" class="mark mark-primary">拟选</text>
            <text v-if="q.lowest" class="mark mark-success">最低价</text>
          </view>
          <text class="line-amount" :class="{ lowest: q.lowest }">{{ money(q.quoteAmountCents) }}</text>
        </view>
        <view class="line-meta">
          <text class="line-meta-item">{{ CHANNEL_LABEL[q.channel] }}</text>
        </view>
        <view
          v-if="q.url"
          class="line-note link quote-url"
          hover-class="is-pressed"
          :hover-stay-time="60"
          @tap="copy(q.url)"
        >
          {{ q.url }}<text class="quote-url-hint">点按复制</text>
        </view>
        <view v-if="q.description" class="line-note">说明：{{ q.description }}</view>
        <AttachmentPicker
          v-if="canReadAttachments && q.attachments.length"
          :model-value="q.attachments"
          ref-type="PURCHASE_QUOTE"
          readonly
        />
      </view>
    </view>

    <view class="panel">
      <view class="panel-title">
        采购选择<text v-if="data.notLowest" class="mark mark-danger">未选最低价</text>
      </view>
      <view class="kv">
        <text class="kv-label">选择理由</text>
        <text class="kv-value">{{ textOr(data.selectionReason) }}</text>
      </view>
      <view v-if="data.notLowest" class="kv">
        <text class="kv-label">未选最低价理由</text>
        <text class="kv-value danger-text">{{ textOr(data.notLowestReason) }}</text>
      </view>
    </view>

    <view v-if="canReadAttachments" class="panel">
      <view class="panel-title">附件</view>
      <view class="attach">
        <AttachmentPicker :model-value="data.attachments" ref-type="PURCHASE_ATTACHMENT" readonly />
      </view>
    </view>
  </view>
</template>

<style scoped src="./fields.css"></style>
<style scoped>
.quote-name {
  display: flex;
  align-items: baseline;
  flex: 1;
  min-width: 0;
}

.quote-name .line-name {
  flex: 0 1 auto;
}

/* 拟选报价：左侧 4rpx 主色竖线 */
.quote.selected {
  margin: 0 -28rpx;
  padding-left: 24rpx;
  padding-right: 28rpx;
  border-left: 4rpx solid var(--eas-primary);
}

.line-amount.lowest {
  color: var(--eas-success);
}

.quote-url {
  padding: 8rpx 0;
  border-radius: var(--eas-radius-tag);
  word-break: break-all;
}

.quote-url-hint {
  margin-left: 16rpx;
  color: var(--eas-ink-3);
}

.attach {
  padding-bottom: 16rpx;
}
</style>
