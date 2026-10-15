<script setup lang="ts">
// 采购申请：申请信息、采购明细、报价比较、采购选择、附件（规则见设计文档 Q5）
import { computed, onMounted } from 'vue'
import type { AttachmentMeta, PurchaseSaveRequest } from '@/lib/types'
import { useDraftForm } from '@/composables/useDraftForm'
import { provideUploadTracker } from '@/lib/fileView'
import {
  compactRows,
  emptyPurchaseItem,
  emptyQuote,
  isEmptyPurchaseItem,
  isEmptyQuote,
  isHttpUrl,
  lowestQuoteCents,
  purchaseItemFromView,
  purchaseItemToInput,
  QUANTITY_RE,
  quoteFromView,
  quoteToInput,
  remapIndexPath,
  trimOrNull,
  type PurchaseItemDraft,
  type QuoteDraft,
} from '@/lib/formModels'
import { formatCents } from '@/lib/money'
import { todayShanghai } from '@/lib/datetime'
import FormShell from './FormShell.vue'
import ItemTable from '@/components/ItemTable.vue'
import QuoteTable from '@/components/QuoteTable.vue'
import AmountInput from '@/components/AmountInput.vue'
import MoneyText from '@/components/MoneyText.vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'

const props = defineProps<{ id?: number }>()

interface PurchaseModel {
  title: string | null
  reason: string | null
  budgetLimitCents: number | null
  expectedArrivalDate: string | null
  singleSource: boolean
  singleSourceReason: string | null
  singleSourceAttachments: AttachmentMeta[]
  selectedQuoteIndex: number | null
  selectionReason: string | null
  notLowestReason: string | null
  items: PurchaseItemDraft[]
  quotes: QuoteDraft[]
  attachments: AttachmentMeta[]
}

const LABELS: Record<string, string> = {
  title: '标题',
  reason: '采购事由',
  budgetLimitCents: '预算上限',
  expectedArrivalDate: '期望到货日期',
  singleSource: '单一来源',
  singleSourceReason: '单一来源说明',
  singleSourceAttachmentIds: '单一来源材料',
  selectedQuoteIndex: '拟选报价',
  selectionReason: '选择理由',
  notLowestReason: '未选最低价理由',
  items: '采购明细',
  quotes: '报价',
  name: '名称',
  spec: '规格型号',
  unit: '单位',
  quantity: '数量',
  unitPriceCents: '单价',
  amountCents: '金额',
  remark: '备注',
  supplierName: '供应商',
  channel: '渠道',
  quoteAmountCents: '报价金额',
  url: '购买链接',
  description: '报价说明',
  attachmentIds: '附件',
}

const len = (s: string | null | undefined) => [...(s ?? '').trim()].length
const normSupplier = (s: string | null) => (s ?? '').replace(/\s/g, '').toLowerCase()

// 最近一次提交给服务端的行下标映射（剔除空行后），用于把错误定位回界面行
let itemMap: number[] = []
let quoteMap: number[] = []

function emptyModel(): PurchaseModel {
  return {
    title: null,
    reason: null,
    budgetLimitCents: null,
    expectedArrivalDate: null,
    singleSource: false,
    singleSourceReason: null,
    singleSourceAttachments: [],
    selectedQuoteIndex: null,
    selectionReason: null,
    notLowestReason: null,
    items: [emptyPurchaseItem()],
    quotes: [emptyQuote(), emptyQuote()],
    attachments: [],
  }
}

function toBody(m: PurchaseModel): Omit<PurchaseSaveRequest, 'version'> {
  const items = compactRows(m.items, isEmptyPurchaseItem)
  const quotes = compactRows(m.quotes, isEmptyQuote)
  itemMap = items.map
  quoteMap = quotes.map
  const sel = m.selectedQuoteIndex == null ? -1 : quotes.map.indexOf(m.selectedQuoteIndex)
  return {
    title: trimOrNull(m.title),
    reason: trimOrNull(m.reason),
    budgetLimitCents: m.budgetLimitCents,
    expectedArrivalDate: m.expectedArrivalDate,
    singleSource: m.singleSource,
    singleSourceReason: m.singleSource ? trimOrNull(m.singleSourceReason) : null,
    singleSourceAttachmentIds: m.singleSource ? m.singleSourceAttachments.map((a) => a.id) : [],
    selectedQuoteIndex: sel >= 0 ? sel : null,
    selectionReason: trimOrNull(m.selectionReason),
    notLowestReason: trimOrNull(m.notLowestReason),
    items: items.kept.map(purchaseItemToInput),
    quotes: quotes.kept.map(quoteToInput),
    attachmentIds: m.attachments.map((a) => a.id),
  }
}

function validate(m: PurchaseModel, full: boolean): Record<string, string> {
  const e: Record<string, string> = {}
  // 格式（保存草稿也检查）
  if (len(m.title) > 100) e.title = '标题不能超过 100 字'
  if (len(m.reason) > 1000) e.reason = '采购事由不能超过 1000 字'
  if (len(m.singleSourceReason) > 1000) e.singleSourceReason = '说明不能超过 1000 字'
  if (len(m.notLowestReason) > 500) e.notLowestReason = '理由不能超过 500 字'
  if (len(m.selectionReason) > 500) e.selectionReason = '理由不能超过 500 字'
  m.items.forEach((it, i) => {
    if (it.quantity && !QUANTITY_RE.test(it.quantity)) e[`items[${i}].quantity`] = '数量最多 3 位小数'
  })
  m.quotes.forEach((q, i) => {
    if (q.url && !isHttpUrl(q.url)) e[`quotes[${i}].url`] = '请输入以 http:// 或 https:// 开头的链接'
  })
  // 成对字段约束（对应数据库 CHECK / 唯一索引，保存草稿时服务端也会拒绝）
  const quotes = m.quotes.map((q, i) => ({ q, i })).filter(({ q }) => !isEmptyQuote(q))
  for (const { q, i } of quotes) {
    if (q.channel === 'ONLINE' && !len(q.url)) e[`quotes[${i}].url`] = '线上报价必须填写购买链接'
  }
  if (m.singleSource && !len(m.singleSourceReason)) e.singleSourceReason = '单一来源采购必须填写说明'
  const seen = new Map<string, number>()
  for (const { q, i } of quotes) {
    const k = normSupplier(q.supplierName)
    if (!k) continue
    if (seen.has(k)) e[`quotes[${i}].supplierName`] = `与第 ${seen.get(k)! + 1} 行供应商重复`
    else seen.set(k, i)
  }
  if (!full) return e

  // 提交前完整检查
  if (!len(m.title)) e.title = '请填写标题'
  if (!len(m.reason)) e.reason = '请填写采购事由'
  if (m.budgetLimitCents == null) e.budgetLimitCents = '请填写预算上限'
  if (!m.expectedArrivalDate) e.expectedArrivalDate = '请选择期望到货日期'
  else if (m.expectedArrivalDate < todayShanghai()) e.expectedArrivalDate = '期望到货日期不能早于今天'

  const items = m.items.map((it, i) => ({ it, i })).filter(({ it }) => !isEmptyPurchaseItem(it))
  if (items.length === 0) e.items = '请至少填写 1 条采购明细'
  for (const { it, i } of items) {
    if (!len(it.name)) e[`items[${i}].name`] = '请填写名称'
    if (!len(it.unit)) e[`items[${i}].unit`] = '请填写单位'
    if (!it.quantity) e[`items[${i}].quantity`] = '请填写数量'
    else if (/^0+(\.0+)?$/.test(it.quantity)) e[`items[${i}].quantity`] = '数量必须大于 0'
    if (it.unitPriceCents == null) e[`items[${i}].unitPriceCents`] = '请填写单价'
    else if (it.unitPriceCents <= 0) e[`items[${i}].unitPriceCents`] = '单价必须大于 0'
  }

  for (const { q, i } of quotes) {
    if (!len(q.supplierName)) e[`quotes[${i}].supplierName`] = '请填写供应商'
    if (q.quoteAmountCents == null || q.quoteAmountCents <= 0) e[`quotes[${i}].quoteAmountCents`] = '请填写报价金额'
    if (q.channel === 'ONLINE') {
      if (q.attachments.length === 0) e[`quotes[${i}].attachmentIds`] = '线上报价至少上传 1 张截图'
    } else if (q.attachments.length === 0 && !len(q.description)) {
      e[`quotes[${i}].attachmentIds`] = '线下报价需上传报价单或填写报价说明'
    }
  }
  const suppliers = new Set(quotes.map(({ q }) => normSupplier(q.supplierName)).filter(Boolean))
  if (m.singleSource) {
    if (len(m.singleSourceReason) < 20) e.singleSourceReason = '单一来源采购需说明原因（至少 20 字），并附说明材料或写明依据'
    if (quotes.length === 0) e.quotes = '请填写该供应商的报价'
  } else if (suppliers.size < 2) {
    e.quotes = '非单一来源采购需至少 2 家不同供应商的报价'
  }
  const sel = m.selectedQuoteIndex
  const selected = sel != null ? m.quotes[sel] : undefined
  if (!selected || isEmptyQuote(selected)) e.selectedQuoteIndex = '请在报价表中选择拟选供应商'
  else {
    const lowest = lowestQuoteCents(quotes.map(({ q }) => q))
    if (selected.quoteAmountCents != null && lowest != null && selected.quoteAmountCents > lowest && len(m.notLowestReason) < 10) {
      e.notLowestReason = '未选择最低报价，请说明理由（至少 10 字）'
    }
    if (selected.quoteAmountCents != null && m.budgetLimitCents != null && selected.quoteAmountCents > m.budgetLimitCents) {
      e.budgetLimitCents = `拟选报价 ¥${formatCents(selected.quoteAmountCents)} 超过预算上限`
    }
  }
  return e
}

const draft = useDraftForm<PurchaseModel>({
  typePath: 'purchase',
  initialId: props.id ?? null,
  idInQuery: props.id == null,
  emptyModel,
  fromDetail: (d) => {
    const p = d.purchase
    if (!p) return emptyModel()
    return {
      title: d.title,
      reason: p.reason,
      budgetLimitCents: p.budgetLimitCents,
      expectedArrivalDate: p.expectedArrivalDate,
      singleSource: p.singleSource,
      singleSourceReason: p.singleSourceReason,
      singleSourceAttachments: p.singleSourceAttachments ?? [],
      selectedQuoteIndex: p.selectedQuoteIndex,
      selectionReason: p.selectionReason,
      notLowestReason: p.notLowestReason,
      items: p.items.length ? p.items.map(purchaseItemFromView) : [emptyPurchaseItem()],
      quotes: p.quotes.length ? p.quotes.map(quoteFromView) : [emptyQuote(), emptyQuote()],
      attachments: p.attachments ?? [],
    }
  },
  toBody,
  validateLight: (m) => validate(m, false),
  validateFull: (m) => validate(m, true),
  mapErrorPath: (path) => remapIndexPath(remapIndexPath(path, 'items', itemMap), 'quotes', quoteMap),
})

const { model, fe } = draft
const uploading = provideUploadTracker()
onMounted(() => void draft.load())

const err = (p: string) => fe.get(p)

const lowest = computed(() => lowestQuoteCents(model.value.quotes))
const selectedQuote = computed(() =>
  model.value.selectedQuoteIndex == null ? null : (model.value.quotes[model.value.selectedQuoteIndex] ?? null),
)
const notLowest = computed(
  () =>
    selectedQuote.value?.quoteAmountCents != null &&
    lowest.value != null &&
    selectedQuote.value.quoteAmountCents > lowest.value,
)
const overBudget = computed(
  () =>
    selectedQuote.value?.quoteAmountCents != null &&
    model.value.budgetLimitCents != null &&
    selectedQuote.value.quoteAmountCents > model.value.budgetLimitCents,
)

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function beforeToday(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` < todayShanghai()
}
</script>

<template>
  <FormShell
    title="采购申请"
    :app-no="draft.appNo.value"
    :loading="draft.loading.value"
    :load-error="draft.loadError.value"
    :dirty="draft.dirty.value"
    :saving="draft.saving.value"
    :submitting="draft.submitting.value"
    :deleting="draft.deleting.value"
    :uploading="uploading"
    :can-delete="draft.id.value != null"
    :errors="fe.summary.value"
    :labels="LABELS"
    @save="draft.saveDraft"
    @submit="draft.submit"
    @delete="draft.removeDraft"
  >
    <el-form label-width="120px" class="purchase-form" @submit.prevent>
      <el-card shadow="never">
        <template #header><span class="section-title">申请信息</span></template>
        <el-form-item label="标题" required :error="err('title')">
          <el-input v-model="model.title" maxlength="100" show-word-limit placeholder="如：研发部采购开发用笔记本电脑" />
        </el-form-item>
        <el-form-item label="采购事由" required :error="err('reason')">
          <el-input v-model="model.reason" type="textarea" :rows="3" maxlength="1000" show-word-limit />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-form-item label="预算上限" required :error="err('budgetLimitCents')">
              <AmountInput v-model:cents="model.budgetLimitCents" style="width: 220px" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="期望到货日期" required :error="err('expectedArrivalDate')">
              <el-date-picker
                v-model="model.expectedArrivalDate"
                type="date"
                value-format="YYYY-MM-DD"
                :disabled-date="beforeToday"
                placeholder="不早于今天"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="section-title">采购明细</span></template>
        <div v-if="err('items')" class="field-error field-error-msg">{{ err('items') }}</div>
        <ItemTable v-model="model.items" :error="err" />
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="card-head">
            <span class="section-title">报价比较</span>
            <el-switch v-model="model.singleSource" active-text="单一来源采购" />
          </div>
        </template>
        <template v-if="model.singleSource">
          <el-alert
            type="error"
            :closable="false"
            show-icon
            title="单一来源采购：审批人会在页头看到红色提示。请说明原因（至少 20 字），并附说明材料或在说明中写明依据。"
            style="margin-bottom: 12px"
          />
          <el-form-item label="单一来源说明" required :error="err('singleSourceReason')">
            <el-input v-model="model.singleSourceReason" type="textarea" :rows="3" maxlength="1000" show-word-limit />
          </el-form-item>
          <el-form-item label="说明材料" :error="err('singleSourceAttachmentIds')">
            <AttachmentUploader v-model="model.singleSourceAttachments" ref-type="SINGLE_SOURCE" :max-count="5" />
          </el-form-item>
        </template>
        <div v-if="err('quotes')" class="field-error field-error-msg">{{ err('quotes') }}</div>
        <QuoteTable v-model="model.quotes" v-model:selected="model.selectedQuoteIndex" :error="err" />
      </el-card>

      <el-card shadow="never">
        <template #header><span class="section-title">采购选择</span></template>
        <el-form-item label="拟选供应商" required :error="err('selectedQuoteIndex')">
          <div v-if="selectedQuote" class="selected">
            <strong>{{ selectedQuote.supplierName || '（未填写供应商）' }}</strong>
            <MoneyText :cents="selectedQuote.quoteAmountCents" strong />
            <el-tag v-if="notLowest" type="danger" disable-transitions>未选最低价</el-tag>
            <el-tag v-else-if="selectedQuote.quoteAmountCents != null" type="success" disable-transitions>最低价</el-tag>
            <el-tag v-if="overBudget" type="danger" effect="plain" disable-transitions>超过预算上限</el-tag>
          </div>
          <span v-else class="muted">请在上方报价表的“拟选”列中选择</span>
        </el-form-item>
        <el-form-item label="选择理由" :error="err('selectionReason')">
          <el-input v-model="model.selectionReason" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item v-if="notLowest || model.notLowestReason" label="未选最低价理由" :required="notLowest" :error="err('notLowestReason')">
          <el-input
            v-model="model.notLowestReason"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="拟选报价不是最低价，请说明理由（至少 10 字）"
          />
        </el-form-item>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="section-title">附件</span></template>
        <el-form-item label="其他附件" :error="err('attachmentIds')">
          <AttachmentUploader v-model="model.attachments" ref-type="PURCHASE_ATTACHMENT" :max-count="20" />
        </el-form-item>
      </el-card>
    </el-form>
  </FormShell>
</template>

<style scoped>
.purchase-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-head .section-title {
  margin: 0;
}
.selected {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.field-error {
  margin-bottom: 8px;
}
</style>
