<script setup lang="ts">
import { computed } from 'vue'
import type { ApplicationDetail } from '@/lib/types'
import { purchaseItemFromView, quoteFromView, expenseItemFromView } from '@/lib/formModels'
import { TRANSPORT_LABEL } from '@/lib/labels'
import { fmtDate, fmtDateTime, fmtTravelDuration } from '@/lib/datetime'
import ItemTable from '@/components/ItemTable.vue'
import QuoteTable from '@/components/QuoteTable.vue'
import ExpenseItemTable from '@/components/ExpenseItemTable.vue'
import FormRenderer from '@/components/FormRenderer.vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import MoneyText from '@/components/MoneyText.vue'
import SlipSection from '@/components/slip/SlipSection.vue'
import SlipFields from '@/components/slip/SlipFields.vue'
import SlipField from '@/components/slip/SlipField.vue'
import LinkedApplicationCard from './LinkedApplicationCard.vue'

const props = defineProps<{ detail: ApplicationDetail }>()
const purchaseItems = computed(() => props.detail.purchase?.items.map(purchaseItemFromView) ?? [])
const quotes = computed(() => props.detail.purchase?.quotes.map(quoteFromView) ?? [])
const expenseItems = computed(() => props.detail.expense?.items.map(expenseItemFromView) ?? [])
</script>

<template>
  <div v-if="detail.viewMode === 'FULL'" class="business">
    <template v-if="detail.type === 'PURCHASE' && detail.purchase">
      <SlipSection title="采购信息">
        <SlipFields>
          <SlipField label="采购事由" full><span class="pre-wrap">{{ detail.purchase.reason ?? '—' }}</span></SlipField>
          <SlipField label="预算上限"><MoneyText :cents="detail.purchase.budgetLimitCents" /></SlipField>
          <SlipField label="期望到货日期"><span class="num">{{ fmtDate(detail.purchase.expectedArrivalDate) }}</span></SlipField>
          <SlipField label="单一来源采购">{{ detail.purchase.singleSource ? '是' : '否' }}</SlipField>
          <SlipField label="拟选金额"><MoneyText :cents="detail.purchase.selectedAmountCents" strong /></SlipField>
          <SlipField v-if="detail.purchase.singleSource" label="单一来源原因" full><span class="pre-wrap">{{ detail.purchase.singleSourceReason ?? '—' }}</span></SlipField>
          <SlipField label="选用理由" full><span class="pre-wrap">{{ detail.purchase.selectionReason ?? '—' }}</span></SlipField>
          <SlipField v-if="detail.purchase.notLowest" label="未选最低价说明" full><span class="pre-wrap text-warning">{{ detail.purchase.notLowestReason ?? '—' }}</span></SlipField>
        </SlipFields>
      </SlipSection>
      <SlipSection title="采购明细">
        <ItemTable :model-value="purchaseItems" readonly :total-cents="detail.purchase.itemsTotalCents" />
      </SlipSection>
      <SlipSection title="报价比较">
        <el-alert v-if="detail.purchase.notLowest" title="拟选报价不是最低报价，请结合未选最低价说明审核。" type="warning" :closable="false" show-icon class="section-alert" />
        <QuoteTable :model-value="quotes" :selected="detail.purchase.selectedQuoteIndex" readonly :show-attachments="detail.canReadAttachments" />
      </SlipSection>
      <SlipSection title="采购附件">
        <template v-if="detail.canReadAttachments">
          <template v-if="detail.purchase.singleSource">
            <h4 class="sub-title">单一来源证明</h4>
            <AttachmentUploader :model-value="detail.purchase.singleSourceAttachments" ref-type="SINGLE_SOURCE" readonly />
            <h4 class="sub-title">其他附件</h4>
          </template>
          <AttachmentUploader :model-value="detail.purchase.attachments" ref-type="PURCHASE_ATTACHMENT" readonly />
        </template>
        <div v-else class="muted">无权查看附件</div>
      </SlipSection>
    </template>

    <template v-else-if="detail.type === 'TRAVEL' && detail.travel">
      <SlipSection title="差旅信息">
        <el-alert v-if="detail.travel.lateReport" title="事后补报：出发时间早于申请提交时间。" type="warning" :closable="false" show-icon class="section-alert" />
        <SlipFields>
          <SlipField label="出发地">{{ detail.travel.origin ?? '—' }}</SlipField>
          <SlipField label="目的地">{{ detail.travel.destination ?? '—' }}</SlipField>
          <SlipField label="开始时间"><span class="num">{{ fmtDateTime(detail.travel.startTime) }}</span></SlipField>
          <SlipField label="结束时间"><span class="num">{{ fmtDateTime(detail.travel.endTime) }}</span></SlipField>
          <SlipField label="出差时长">{{ fmtTravelDuration(detail.travel.naturalDays, detail.travel.durationHours) }}</SlipField>
          <SlipField label="交通方式">{{ detail.travel.transport ? TRANSPORT_LABEL[detail.travel.transport] : '—' }}</SlipField>
          <SlipField label="预算"><MoneyText :cents="detail.travel.budgetCents" /></SlipField>
          <SlipField label="同行人">
            <template v-if="detail.travel.companions.length">
              <span v-for="(companion, index) in detail.travel.companions" :key="index">{{ index ? '、' : '' }}{{ companion.userName ?? companion.name ?? '—' }}<span v-if="companion.deptName" class="muted">（{{ companion.deptName }}）</span></span>
            </template>
            <span v-else>无</span>
          </SlipField>
          <SlipField label="出差目的" full><span class="pre-wrap">{{ detail.travel.purpose ?? '—' }}</span></SlipField>
        </SlipFields>
      </SlipSection>
      <SlipSection title="差旅附件">
        <AttachmentUploader v-if="detail.canReadAttachments" :model-value="detail.travel.attachments" ref-type="TRAVEL_ATTACHMENT" readonly />
        <div v-else class="muted">无权查看附件</div>
      </SlipSection>
    </template>

    <template v-else-if="detail.type === 'EXPENSE' && detail.expense">
      <SlipSection title="报销信息">
        <SlipFields>
          <SlipField label="报销说明" full><span class="pre-wrap">{{ detail.expense.description ?? '—' }}</span></SlipField>
          <SlipField label="报销总额"><MoneyText :cents="detail.expense.totalAmountCents" strong /></SlipField>
          <SlipField label="无票明细"><span class="num">{{ detail.expense.noInvoiceCount }} 项</span><span class="gap" /><MoneyText :cents="detail.expense.noInvoiceAmountCents" /></SlipField>
          <SlipField v-if="!detail.expense.related.length" label="独立报销原因" full><span class="pre-wrap">{{ detail.expense.independentReason ?? '—' }}</span></SlipField>
        </SlipFields>
      </SlipSection>
      <SlipSection v-if="detail.expense.related.length" title="关联申请">
        <div class="related-list"><LinkedApplicationCard v-for="related in detail.expense.related" :key="related.id" :application="related" /></div>
      </SlipSection>
      <SlipSection title="报销明细与票据">
        <el-alert v-if="detail.expense.noInvoiceCount" title="存在无票明细，请核对底色标出的行中的无票原因。" type="warning" :closable="false" show-icon class="section-alert" />
        <ExpenseItemTable :model-value="expenseItems" readonly :show-attachments="detail.canReadAttachments" />
      </SlipSection>
    </template>

    <SlipSection v-else-if="detail.type === 'CUSTOM' && detail.custom" title="申请内容">
      <template #extra><span class="muted small">表单版本 v{{ detail.custom.versionNo }}</span></template>
      <el-alert v-if="detail.status === 'DRAFT' && detail.custom.outdated" title="此草稿的模板版本已更新，请进入编辑页按最新模板检查后提交。" type="warning" :closable="false" show-icon class="section-alert" />
      <FormRenderer class="readonly-fields" label-width="132px" :model-value="detail.custom.formValues" :attachments="detail.custom.attachments" :schema="detail.custom.formSchema" readonly :show-attachments="detail.canReadAttachments" />
    </SlipSection>
    <el-alert v-else title="未返回业务内容，请刷新后重试。" type="warning" :closable="false" show-icon />
  </div>
</template>

<style scoped>
.business { display: contents; }
.related-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.section-alert { margin-bottom: 12px; }
.sub-title { margin: 0 0 8px; color: var(--eas-ink-2); font-size: var(--eas-fs-sm); font-weight: 400; }
.sub-title:not(:first-child) { margin-top: 16px; }
.num { font-variant-numeric: tabular-nums; }
.gap { display: inline-block; width: 16px; }
/* 自定义表单只读：与字段区同一套版式 */
.readonly-fields { border-top: 1px solid var(--eas-rule); }
.readonly-fields :deep(.el-form-item) { margin: 0; padding: 5px 0; border-bottom: 1px solid var(--eas-rule); }
.readonly-fields :deep(.el-form-item__label) { justify-content: flex-start; color: var(--eas-ink-2); }
.readonly-fields :deep(.el-form-item__content) { color: var(--eas-ink); }
</style>
