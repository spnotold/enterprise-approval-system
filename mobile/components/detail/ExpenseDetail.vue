<script setup lang="ts">
// 报销详情：合计、无票支出提示、关联申请卡片（可跳转）、费用明细逐行排布（无票行用土黄底）、票据与疑似重复提示
import type { ExpenseView, InvoiceView } from '@/lib/types'
import { formatCents } from '@/lib/money'
import AttachmentPicker from '@/components/AttachmentPicker.vue'
import LinkedAppCard from '@/components/LinkedAppCard.vue'
import { APP_STATUS_LABEL, textOr } from '@/utils/labels'
import { goDetail } from '@/utils/nav'

defineProps<{
  data: ExpenseView
  canReadAttachments: boolean
}>()

/**
 * 跨单疑似重复票据：审批人能看到对方单号与状态；申请人只看到通用提示（对方字段为 null）。
 */
function warnings(invoices: InvoiceView[]): Record<number, string> {
  const r: Record<number, string> = {}
  for (const inv of invoices) {
    const known = (inv.duplicates ?? []).filter((d) => d.otherAppNo)
    if (known.length) {
      r[inv.attachmentId] =
        '疑似重复票据：已在 ' +
        known.map((d) => `${d.otherAppNo}${d.otherStatus ? `（${APP_STATUS_LABEL[d.otherStatus]}）` : ''}`).join('、') +
        ' 中使用'
    } else if (inv.suspectedDuplicate || inv.duplicates?.length) {
      r[inv.attachmentId] = '该票据疑似已在其他报销单中使用'
    }
  }
  return r
}
</script>

<template>
  <view>
    <view class="panel">
      <view class="panel-title">报销信息</view>
      <view class="kv">
        <text class="kv-label">报销合计</text>
        <text class="kv-value amount">¥{{ formatCents(data.totalAmountCents) }}</text>
      </view>
      <view v-if="data.description" class="kv">
        <text class="kv-label">报销说明</text>
        <text class="kv-value">{{ data.description }}</text>
      </view>
      <view v-if="!data.related.length" class="kv">
        <text class="kv-label">独立报销说明</text>
        <text class="kv-value">{{ textOr(data.independentReason) }}</text>
      </view>
    </view>

    <view v-if="data.noInvoiceCount > 0" class="note note-warning">
      含 {{ data.noInvoiceCount }} 条无票支出，合计 <text class="num">¥{{ formatCents(data.noInvoiceAmountCents) }}</text>
    </view>

    <view v-if="data.related.length" class="panel">
      <view class="panel-title">关联申请</view>
      <view
        v-for="r in data.related"
        :key="r.id"
        class="related"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="goDetail(r.id)"
      >
        <LinkedAppCard :app="r" />
      </view>
    </view>

    <view class="panel">
      <view class="panel-title">费用明细<text class="panel-sub">{{ data.items.length }} 条</text></view>
      <view v-for="(it, i) in data.items" :key="i" class="line" :class="{ 'no-invoice': it.noInvoice }">
        <view class="line-main">
          <text class="line-name">{{ textOr(it.expenseTypeName || it.expenseTypeCode) }}</text>
          <text class="line-amount">{{ it.amountCents === null ? '—' : '¥' + formatCents(it.amountCents) }}</text>
        </view>
        <view class="line-meta">
          <text class="line-meta-item">{{ textOr(it.occurDate) }}</text>
          <text class="line-meta-item">{{ textOr(it.purpose) }}</text>
        </view>
        <view v-if="it.noInvoice" class="line-note no-invoice-reason">
          <text class="mark mark-warning no-invoice-mark">无票</text>{{ textOr(it.noInvoiceReason) }}
        </view>
        <AttachmentPicker
          v-else-if="canReadAttachments"
          :model-value="it.invoices.map((v) => v.attachment)"
          :invoice-nos="it.invoices.map((v) => v.invoiceNo || '')"
          :warnings="warnings(it.invoices)"
          ref-type="EXPENSE_INVOICE"
          with-invoice-no
          readonly
          empty-text="无票据"
        />
        <view v-else class="line-note">{{ it.invoices.length }} 张票据</view>
      </view>
    </view>
  </view>
</template>

<style scoped src="./fields.css"></style>
<style scoped>
.related {
  border-radius: var(--eas-radius-control);
}

/* 无票明细：土黄浅底铺满整行 */
.line.no-invoice {
  margin: 0 -28rpx;
  padding-left: 28rpx;
  padding-right: 28rpx;
  background: var(--eas-warning-tint);
}

.no-invoice-reason {
  color: var(--eas-warning-text);
}

.no-invoice-mark {
  margin: 0 12rpx 0 0;
}
</style>
