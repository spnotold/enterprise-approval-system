<script setup lang="ts">
// 报销申请：关联申请（或独立报销说明）、费用明细（默认 3 行，提交前剔除全空行）、票据、即时合计（规则见设计文档 Q7）
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/api'
import type { DupInvoiceWarning, ExpenseSaveRequest, LinkableApplication } from '@/lib/types'
import { useDraftForm } from '@/composables/useDraftForm'
import { provideUploadTracker } from '@/lib/fileView'
import {
  compactRows,
  emptyExpenseItem,
  expenseItemFromView,
  expenseItemToInput,
  isEmptyExpenseItem,
  remapIndexPath,
  trimOrNull,
  type ExpenseItemDraft,
} from '@/lib/formModels'
import { MAX_ITEM_CENTS, formatCents, sumCents } from '@/lib/money'
import { addDays, fmtDate, fmtDateTime, isDateString, todayShanghai } from '@/lib/datetime'
import { APP_TYPE_LABEL } from '@/lib/labels'
import FormShell from './FormShell.vue'
import ExpenseItemTable from '@/components/ExpenseItemTable.vue'
import MoneyText from '@/components/MoneyText.vue'

const props = defineProps<{ id?: number }>()
const router = useRouter()

interface ExpenseModel {
  title: string | null
  description: string | null
  /** 界面用：关联申请 / 独立报销 */
  linkMode: 'RELATED' | 'INDEPENDENT'
  relatedApplicationIds: number[]
  independentReason: string | null
  items: ExpenseItemDraft[]
}

const LABELS: Record<string, string> = {
  title: '标题',
  description: '报销说明',
  relatedApplicationIds: '关联申请',
  independentReason: '独立报销说明',
  items: '费用明细',
  expenseTypeCode: '费用类型',
  occurDate: '发生日期',
  purpose: '用途说明',
  amountCents: '金额',
  noInvoice: '无票',
  noInvoiceReason: '无票原因',
  invoices: '票据',
  invoiceNo: '票据号',
  attachmentId: '票据文件',
}

const DEFAULT_ROWS = 3
const len = (s: string | null | undefined) => [...(s ?? '').trim()].length
const normNo = (s: string | null | undefined) => (s ?? '').replace(/\s/g, '').toUpperCase()
let itemMap: number[] = []

function emptyModel(): ExpenseModel {
  return {
    title: null,
    description: null,
    linkMode: 'RELATED',
    relatedApplicationIds: [],
    independentReason: null,
    items: Array.from({ length: DEFAULT_ROWS }, emptyExpenseItem),
  }
}

function toBody(m: ExpenseModel): Omit<ExpenseSaveRequest, 'version'> {
  // 提交前剔除全空的明细行；错误路径按 itemMap 映射回界面行
  const items = compactRows(m.items, isEmptyExpenseItem)
  itemMap = items.map
  return {
    title: trimOrNull(m.title),
    description: trimOrNull(m.description),
    relatedApplicationIds: m.linkMode === 'RELATED' ? m.relatedApplicationIds : [],
    independentReason: m.linkMode === 'INDEPENDENT' ? trimOrNull(m.independentReason) : null,
    items: items.kept.map(expenseItemToInput),
  }
}

function validate(m: ExpenseModel, full: boolean): Record<string, string> {
  const e: Record<string, string> = {}
  if (len(m.title) > 100) e.title = '标题不能超过 100 字'
  if (len(m.description) > 1000) e.description = '报销说明不能超过 1000 字'
  if (len(m.independentReason) > 500) e.independentReason = '独立报销说明不能超过 500 字'
  m.items.forEach((it, i) => {
    if (len(it.purpose) > 200) e[`items[${i}].purpose`] = '用途说明不能超过 200 字'
    if (len(it.noInvoiceReason) > 300) e[`items[${i}].noInvoiceReason`] = '原因不能超过 300 字'
    if (it.amountCents != null && it.amountCents > MAX_ITEM_CENTS) e[`items[${i}].amountCents`] = '单条金额不能超过 ¥100,000.00'
  })
  if (m.items.filter((it) => !isEmptyExpenseItem(it)).length > 50) e.items = '明细最多 50 条'
  // 成对字段约束（保存草稿时服务端也会检查）：无票需原因、每条最多 10 张票据、同单内票据不重复
  const seenFile = new Map<string, number>()
  const seenNo = new Map<string, number>()
  m.items.forEach((it, i) => {
    if (isEmptyExpenseItem(it)) return
    const p = `items[${i}]`
    if (it.noInvoice && !len(it.noInvoiceReason)) e[`${p}.noInvoiceReason`] = '勾选无票时必须填写原因'
    if (it.noInvoice) return
    if (it.invoices.length > 10) e[`${p}.invoices`] = '每条明细最多 10 张票据'
    for (const inv of it.invoices) {
      const fileKey = inv.attachment.sha256 || String(inv.attachment.id)
      const no = normNo(inv.invoiceNo)
      const dupRow = seenFile.get(fileKey) ?? (no ? seenNo.get(no) : undefined)
      if (dupRow !== undefined) {
        e[`${p}.invoices`] = `“${inv.attachment.originalName}”与第 ${dupRow + 1} 行的票据重复，同一报销单内不能重复使用`
      }
      if (!seenFile.has(fileKey)) seenFile.set(fileKey, i)
      if (no && !seenNo.has(no)) seenNo.set(no, i)
    }
  })
  if (!full) return e

  if (!len(m.title)) e.title = '请填写标题'
  if (m.linkMode === 'RELATED' && m.relatedApplicationIds.length === 0) {
    e.relatedApplicationIds = '请选择关联的差旅 / 采购申请，或改为独立报销并填写说明'
  }
  if (m.linkMode === 'INDEPENDENT' && !len(m.independentReason)) e.independentReason = '不关联申请时必须填写独立报销说明'

  const rows = m.items.map((it, i) => ({ it, i })).filter(({ it }) => !isEmptyExpenseItem(it))
  if (rows.length === 0) e.items = '请至少填写 1 条费用明细'
  const today = todayShanghai()
  const earliest = addDays(today, -365)
  for (const { it, i } of rows) {
    const p = `items[${i}]`
    if (!it.expenseTypeCode) e[`${p}.expenseTypeCode`] = '请选择费用类型'
    if (!it.occurDate) e[`${p}.occurDate`] = '请选择发生日期'
    else if (!isDateString(it.occurDate) || it.occurDate > today || it.occurDate < earliest) {
      e[`${p}.occurDate`] = '发生日期不能晚于今天，且不能早于 365 天前'
    }
    if (!len(it.purpose)) e[`${p}.purpose`] = '请填写用途说明'
    if (it.amountCents == null || it.amountCents <= 0) e[`${p}.amountCents`] = '金额必须大于 0'
    if (it.noInvoice) {
      if (len(it.noInvoiceReason) < 10) e[`${p}.noInvoiceReason`] = '勾选无票时需填写原因（至少 10 字）'
    } else if (it.invoices.length === 0) {
      e[`${p}.invoices`] = '请上传票据或勾选无票并填写原因'
    }
  }
  return e
}

// ---------- 关联申请 ----------
const linkable = ref<LinkableApplication[]>([])
const linkableLoading = ref(false)
/** 草稿中已关联、但已不在可关联列表中的申请（来自详情） */
const savedRelated = ref<LinkableApplication[]>([])
const linkOptions = computed(() => {
  const map = new Map<number, LinkableApplication>()
  for (const a of [...savedRelated.value, ...linkable.value]) map.set(a.id, a)
  return [...map.values()]
})

async function loadLinkable() {
  linkableLoading.value = true
  try {
    linkable.value = await api.applications.linkable()
  } catch {
    linkable.value = []
  } finally {
    linkableLoading.value = false
  }
}

function linkLabel(a: LinkableApplication): string {
  const type = APP_TYPE_LABEL[a.type]
  if (a.type === 'TRAVEL' && a.travel) {
    return `${a.appNo} ${type} ${a.travel.destination ?? ''} ${fmtDate(a.travel.startTime)} ~ ${fmtDate(a.travel.endTime)}`
  }
  return `${a.appNo} ${type} ${a.title ?? ''}`
}

// ---------- 跨单疑似重复票据（保存后查询，只提示不拦截） ----------
const duplicates = ref<DupInvoiceWarning[]>([])
async function loadDuplicates(id: number) {
  try {
    duplicates.value = await api.applications.invoiceDuplicates(id)
  } catch {
    duplicates.value = []
  }
}

const draft = useDraftForm<ExpenseModel>({
  typePath: 'expense',
  initialId: props.id ?? null,
  idInQuery: props.id == null,
  emptyModel,
  fromDetail: (d) => {
    const x = d.expense
    if (!x) return emptyModel()
    savedRelated.value = x.related ?? []
    const items = x.items.map(expenseItemFromView)
    while (items.length < DEFAULT_ROWS) items.push(emptyExpenseItem())
    return {
      title: d.title,
      description: x.description,
      linkMode: x.relatedApplicationIds.length === 0 && x.independentReason ? 'INDEPENDENT' : 'RELATED',
      relatedApplicationIds: x.relatedApplicationIds ?? [],
      independentReason: x.independentReason,
      items,
    }
  },
  onLoaded: (d) => void loadDuplicates(d.id),
  afterSave: (r) => loadDuplicates(r.id),
  toBody,
  validateLight: (m) => validate(m, false),
  validateFull: (m) => validate(m, true),
  mapErrorPath: (path) => remapIndexPath(path, 'items', itemMap),
})

const { model, fe } = draft
const uploading = provideUploadTracker()
onMounted(() => {
  void draft.load()
  void loadLinkable()
})

const err = (p: string) => fe.get(p)
const total = computed(() => sumCents(model.value.items.map((i) => i.amountCents)))
const noInvoiceRows = computed(() => model.value.items.filter((i) => i.noInvoice && !isEmptyExpenseItem(i)))
const selectedRelated = computed(() =>
  model.value.relatedApplicationIds
    .map((id) => linkOptions.value.find((a) => a.id === id))
    .filter((a): a is LinkableApplication => !!a),
)
</script>

<template>
  <FormShell
    title="报销申请"
    description="填写费用明细并提供票据"
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
    <template #header-extra>
      <div class="total-box">
        <div class="muted small">报销合计</div>
        <MoneyText :cents="total" strong class="total" />
        <div v-if="noInvoiceRows.length" class="small text-warning">
          含 {{ noInvoiceRows.length }} 条无票支出（合计 ¥{{ formatCents(sumCents(noInvoiceRows.map((r) => r.amountCents))) }}）
        </div>
      </div>
    </template>

    <el-form label-position="top" class="expense-form" @submit.prevent>
      <section class="form-section">
        <h3 class="section-title">报销信息</h3>
        <el-form-item label="标题" required :error="err('title')">
          <el-input v-model="model.title" maxlength="100" show-word-limit placeholder="如：11 月北京出差报销" />
        </el-form-item>
        <el-form-item label="报销说明" :error="err('description')">
          <el-input v-model="model.description" type="textarea" :rows="2" maxlength="1000" show-word-limit />
        </el-form-item>
        <el-form-item label="关联方式" required>
          <el-radio-group v-model="model.linkMode">
            <el-radio value="RELATED">关联差旅 / 采购申请</el-radio>
            <el-radio value="INDEPENDENT">独立报销</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="model.linkMode === 'RELATED'" label="关联申请" required :error="err('relatedApplicationIds')">
          <div class="related">
            <el-select
              v-model="model.relatedApplicationIds"
              multiple
              filterable
              :loading="linkableLoading"
              placeholder="选择本人已通过的差旅 / 采购申请"
              no-data-text="没有可关联的申请（仅本人已通过的差旅 / 采购单）"
              style="width: 100%"
            >
              <el-option v-for="a in linkOptions" :key="a.id" :value="a.id" :label="linkLabel(a)" />
            </el-select>
            <div v-if="selectedRelated.length" class="related-cards">
              <el-card v-for="a in selectedRelated" :key="a.id" shadow="never" class="related-card" body-style="padding:10px 12px">
                <div class="related-head">
                  <el-tag size="small" disable-transitions>{{ APP_TYPE_LABEL[a.type] }}</el-tag>
                  <el-link type="primary" @click="router.push(`/applications/${a.id}`)">{{ a.appNo }}</el-link>
                </div>
                <div class="small">{{ a.title ?? '—' }}</div>
                <template v-if="a.travel">
                  <div class="muted small">{{ a.travel.origin ?? '' }} 至 {{ a.travel.destination ?? '' }}</div>
                  <div class="muted small">
                    {{ fmtDateTime(a.travel.startTime) }} ~ {{ fmtDateTime(a.travel.endTime) }}，{{ a.travel.naturalDays ?? '—' }} 天
                  </div>
                  <div class="small">预算 <MoneyText :cents="a.travel.budgetCents" /></div>
                </template>
                <template v-else-if="a.purchase">
                  <div class="muted small">供应商：{{ a.purchase.selectedSupplier ?? '—' }}，{{ a.purchase.itemCount }} 项明细</div>
                  <div class="small">金额 <MoneyText :cents="a.purchase.selectedAmountCents" /></div>
                </template>
              </el-card>
            </div>
          </div>
        </el-form-item>
        <el-form-item v-else label="独立报销说明" required :error="err('independentReason')">
          <el-input
            v-model="model.independentReason"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="不关联差旅 / 采购申请时，请说明报销背景"
          />
        </el-form-item>
      </section>

      <section class="form-section">
        <h3 class="section-title">费用明细</h3>
        <div v-if="err('items')" class="field-error field-error-msg">{{ err('items') }}</div>
        <el-alert
          v-if="duplicates.length"
          type="warning"
          :closable="false"
          show-icon
          :title="`有 ${duplicates.length} 张票据疑似已在其他报销单中使用，仍可提交，由财务审核判断`"
          style="margin-bottom: 8px"
        />
        <ExpenseItemTable v-model="model.items" :error="err" :duplicates="duplicates" />
      </section>
    </el-form>
  </FormShell>
</template>

<style scoped>
.expense-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.total-box {
  text-align: right;
}
.total {
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-26);
}
.related {
  width: 100%;
}
.related-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
  gap: 8px;
  margin-top: 8px;
}
.related-card {
  border: 1px solid var(--eas-rule);
}
.related-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.field-error {
  margin-bottom: 8px;
}
</style>
