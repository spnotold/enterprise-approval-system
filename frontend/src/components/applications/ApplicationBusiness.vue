<script setup lang="ts">
import { computed } from 'vue'
import type { ApplicationDetail } from '@/lib/types'
import { purchaseItemFromView, quoteFromView, expenseItemFromView } from '@/lib/formModels'
import { TRANSPORT_LABEL } from '@/lib/labels'
import { fmtDate, fmtDateTime, fmtTravelDuration } from '@/lib/datetime'
import { useBreakpoint } from '@/composables/useBreakpoint'
import ItemTable from '@/components/ItemTable.vue'
import QuoteTable from '@/components/QuoteTable.vue'
import ExpenseItemTable from '@/components/ExpenseItemTable.vue'
import FormRenderer from '@/components/FormRenderer.vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import MoneyText from '@/components/MoneyText.vue'
import LinkedApplicationCard from './LinkedApplicationCard.vue'

const props = defineProps<{ detail: ApplicationDetail }>()
const { isMobile } = useBreakpoint()
const columns = computed(() => isMobile.value ? 1 : 2)
const purchaseItems = computed(() => props.detail.purchase?.items.map(purchaseItemFromView) ?? [])
const quotes = computed(() => props.detail.purchase?.quotes.map(quoteFromView) ?? [])
const expenseItems = computed(() => props.detail.expense?.items.map(expenseItemFromView) ?? [])
</script>

<template>
  <div v-if="detail.viewMode === 'FULL'" class="business">
    <template v-if="detail.type === 'PURCHASE' && detail.purchase">
      <el-card shadow="never">
        <template #header><h3 class="section-title">采购信息</h3></template>
        <el-descriptions :column="columns" border>
          <el-descriptions-item label="采购事由" :span="columns"><span class="pre-wrap">{{ detail.purchase.reason ?? '—' }}</span></el-descriptions-item>
          <el-descriptions-item label="预算上限"><MoneyText :cents="detail.purchase.budgetLimitCents" /></el-descriptions-item>
          <el-descriptions-item label="期望到货日期">{{ fmtDate(detail.purchase.expectedArrivalDate) }}</el-descriptions-item>
          <el-descriptions-item label="单一来源采购">{{ detail.purchase.singleSource ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="拟选金额"><MoneyText :cents="detail.purchase.selectedAmountCents" strong /></el-descriptions-item>
          <el-descriptions-item v-if="detail.purchase.singleSource" label="单一来源原因" :span="columns"><span class="pre-wrap">{{ detail.purchase.singleSourceReason ?? '—' }}</span></el-descriptions-item>
          <el-descriptions-item label="选用理由" :span="columns"><span class="pre-wrap">{{ detail.purchase.selectionReason ?? '—' }}</span></el-descriptions-item>
          <el-descriptions-item v-if="detail.purchase.notLowest" label="未选最低价说明" :span="columns"><span class="pre-wrap text-warning">{{ detail.purchase.notLowestReason ?? '—' }}</span></el-descriptions-item>
        </el-descriptions>
      </el-card>
      <el-card shadow="never">
        <template #header><h3 class="section-title">采购明细</h3></template>
        <ItemTable :model-value="purchaseItems" readonly :total-cents="detail.purchase.itemsTotalCents" />
      </el-card>
      <el-card shadow="never">
        <template #header><h3 class="section-title">报价比较</h3></template>
        <el-alert v-if="detail.purchase.notLowest" title="拟选报价不是最低报价，请结合未选最低价说明审核。" type="warning" :closable="false" show-icon class="section-alert" />
        <QuoteTable :model-value="quotes" :selected="detail.purchase.selectedQuoteIndex" readonly :show-attachments="detail.canReadAttachments" />
      </el-card>
      <el-card shadow="never">
        <template #header><h3 class="section-title">采购附件</h3></template>
        <template v-if="detail.canReadAttachments">
          <template v-if="detail.purchase.singleSource">
            <h4 class="section-title">单一来源证明</h4>
            <AttachmentUploader :model-value="detail.purchase.singleSourceAttachments" ref-type="SINGLE_SOURCE" readonly />
            <el-divider />
          </template>
          <AttachmentUploader :model-value="detail.purchase.attachments" ref-type="PURCHASE_ATTACHMENT" readonly />
        </template>
        <div v-else class="muted">无权查看附件</div>
      </el-card>
    </template>

    <template v-else-if="detail.type === 'TRAVEL' && detail.travel">
      <el-card shadow="never">
        <template #header><h3 class="section-title">差旅信息</h3></template>
        <el-alert v-if="detail.travel.lateReport" title="事后补报：出发时间早于申请提交时间。" type="warning" :closable="false" show-icon class="section-alert" />
        <el-descriptions :column="columns" border>
          <el-descriptions-item label="出发地">{{ detail.travel.origin ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="目的地">{{ detail.travel.destination ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ fmtDateTime(detail.travel.startTime) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ fmtDateTime(detail.travel.endTime) }}</el-descriptions-item>
          <el-descriptions-item label="出差时长">{{ fmtTravelDuration(detail.travel.naturalDays, detail.travel.durationHours) }}</el-descriptions-item>
          <el-descriptions-item label="交通方式">{{ detail.travel.transport ? TRANSPORT_LABEL[detail.travel.transport] : '—' }}</el-descriptions-item>
          <el-descriptions-item label="预算"><MoneyText :cents="detail.travel.budgetCents" /></el-descriptions-item>
          <el-descriptions-item label="同行人">
            <template v-if="detail.travel.companions.length">
              <span v-for="(companion, index) in detail.travel.companions" :key="index">{{ index ? '、' : '' }}{{ companion.userName ?? companion.name ?? '—' }}<span v-if="companion.deptName" class="muted">（{{ companion.deptName }}）</span></span>
            </template>
            <span v-else>无</span>
          </el-descriptions-item>
          <el-descriptions-item label="出差目的" :span="columns"><span class="pre-wrap">{{ detail.travel.purpose ?? '—' }}</span></el-descriptions-item>
        </el-descriptions>
      </el-card>
      <el-card shadow="never">
        <template #header><h3 class="section-title">差旅附件</h3></template>
        <AttachmentUploader v-if="detail.canReadAttachments" :model-value="detail.travel.attachments" ref-type="TRAVEL_ATTACHMENT" readonly />
        <div v-else class="muted">无权查看附件</div>
      </el-card>
    </template>

    <template v-else-if="detail.type === 'EXPENSE' && detail.expense">
      <el-card shadow="never">
        <template #header><h3 class="section-title">报销信息</h3></template>
        <el-descriptions :column="columns" border>
          <el-descriptions-item label="报销说明" :span="columns"><span class="pre-wrap">{{ detail.expense.description ?? '—' }}</span></el-descriptions-item>
          <el-descriptions-item label="报销总额"><MoneyText :cents="detail.expense.totalAmountCents" strong /></el-descriptions-item>
          <el-descriptions-item label="无票明细">{{ detail.expense.noInvoiceCount }} 项 / <MoneyText :cents="detail.expense.noInvoiceAmountCents" /></el-descriptions-item>
          <el-descriptions-item v-if="!detail.expense.related.length" label="独立报销原因" :span="columns"><span class="pre-wrap">{{ detail.expense.independentReason ?? '—' }}</span></el-descriptions-item>
        </el-descriptions>
      </el-card>
      <el-card v-if="detail.expense.related.length" shadow="never">
        <template #header><h3 class="section-title">关联申请</h3></template>
        <div class="related-list"><LinkedApplicationCard v-for="related in detail.expense.related" :key="related.id" :application="related" /></div>
      </el-card>
      <el-card shadow="never">
        <template #header><h3 class="section-title">报销明细与票据</h3></template>
        <el-alert v-if="detail.expense.noInvoiceCount" title="存在无票明细，请核对橙色行中的无票原因。" type="warning" :closable="false" show-icon class="section-alert" />
        <ExpenseItemTable :model-value="expenseItems" readonly :show-attachments="detail.canReadAttachments" />
      </el-card>
    </template>

    <el-card v-else-if="detail.type === 'CUSTOM' && detail.custom" shadow="never">
      <template #header><h3 class="section-title">{{ detail.templateName }} · 表单 v{{ detail.custom.versionNo }}</h3></template>
      <el-alert v-if="detail.status === 'DRAFT' && detail.custom.outdated" title="此草稿的模板版本已更新，请进入编辑页按最新模板检查后提交。" type="warning" :closable="false" show-icon class="section-alert" />
      <FormRenderer :model-value="detail.custom.formValues" :attachments="detail.custom.attachments" :schema="detail.custom.formSchema" readonly :show-attachments="detail.canReadAttachments" />
    </el-card>
    <el-alert v-else title="未返回业务内容，请刷新后重试。" type="warning" :closable="false" show-icon />
  </div>
</template>

<style scoped>
.business, .related-list { display: flex; flex-direction: column; gap: var(--eas-gap); }
.section-alert { margin-bottom: 12px; }
</style>
