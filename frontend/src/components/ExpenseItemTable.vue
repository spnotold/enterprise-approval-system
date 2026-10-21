<script setup lang="ts">
// 报销明细表：费用类型、发生日期、用途、金额、票据（或无票 + 原因）；即时合计（整数分相加）。
// 只读模式下无票行整行橙色高亮，跨单疑似重复票据显示红色标签。
import { computed, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Plus, WarningFilled } from '@element-plus/icons-vue'
import { useDictStore } from '@/stores/dict'
import { sumCents } from '@/lib/money'
import { addDays, todayShanghai } from '@/lib/datetime'
import { APP_STATUS_LABEL } from '@/lib/labels'
import type { AttachmentMeta, DupInvoiceWarning } from '@/lib/types'
import { emptyExpenseItem, type ExpenseItemDraft, type InvoiceDraft } from '@/lib/formModels'
import AmountInput from './AmountInput.vue'
import MoneyText from './MoneyText.vue'
import AttachmentUploader from './AttachmentUploader.vue'

const items = defineModel<ExpenseItemDraft[]>({ required: true })

const props = withDefaults(
  defineProps<{
    readonly?: boolean
    error?: (path: string) => string | undefined
    prefix?: string
    maxRows?: number
    /** 编辑模式：保存后查询到的跨单疑似重复（黄色提示） */
    duplicates?: DupInvoiceWarning[]
    /** 只读模式下是否可查看票据文件 */
    showAttachments?: boolean
  }>(),
  { readonly: false, error: () => undefined, prefix: 'items', maxRows: 50, duplicates: () => [], showAttachments: true },
)

const dict = useDictStore()
onMounted(() => {
  if (!props.readonly) void dict.loadExpenseTypes().catch(() => undefined)
})

const err = (i: number, field?: string) => props.error(field ? `${props.prefix}[${i}].${field}` : `${props.prefix}[${i}]`)

const total = computed(() => sumCents(items.value.map((i) => i.amountCents)))
const today = computed(() => todayShanghai())
const earliest = computed(() => addDays(today.value, -365))

function pad(n: number) {
  return String(n).padStart(2, '0')
}
/** 发生日期不晚于当天、不早于 365 天前（按上海日期） */
function disabledDate(d: Date): boolean {
  const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return s > today.value || s < earliest.value
}

// el-table 插槽中的 row 类型为 DefaultRow，这里统一收窄
const asRow = (r: object) => r as ExpenseItemDraft

function invoiceMetas(r: object): AttachmentMeta[] {
  const row = asRow(r)
  return row.invoices.map((v) => v.attachment)
}

/** 上传组件只管理附件元数据，票据号按附件 id 保留 */
function setInvoiceMetas(r: object, metas: AttachmentMeta[]) {
  const row = asRow(r)
  const byId = new Map(row.invoices.map((v) => [v.attachment.id, v]))
  row.invoices = metas.map((m): InvoiceDraft => byId.get(m.id) ?? { attachment: m, invoiceNo: null })
}

function invoiceOf(r: object, id: number): InvoiceDraft | undefined {
  return asRow(r).invoices.find((v) => v.attachment.id === id)
}

function setInvoiceNo(r: object, id: number, v: string) {
  const inv = invoiceOf(r, id)
  if (inv) inv.invoiceNo = v === '' ? null : v
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s/g, '').toUpperCase()

function dupsFor(inv: InvoiceDraft | undefined): DupInvoiceWarning[] {
  if (!inv) return []
  if (props.readonly) return inv.duplicates ?? []
  return props.duplicates.filter(
    (d) => d.attachmentId === inv.attachment.id || (!!inv.invoiceNo && norm(d.invoiceNo) === norm(inv.invoiceNo)),
  )
}

/** 可显示对方单号的重复记录（审批人 / 财务可见；申请人本人看到的为 null） */
function namedDups(inv: InvoiceDraft | undefined): DupInvoiceWarning[] {
  return dupsFor(inv).filter((d) => !!d.otherAppNo)
}

/** 是否疑似跨单重复 */
function suspected(inv: InvoiceDraft | undefined): boolean {
  if (!inv) return false
  return dupsFor(inv).length > 0 || (props.readonly && !!inv.suspectedDuplicate)
}

function dupText(d: DupInvoiceWarning): string {
  const status = d.otherStatus ? (APP_STATUS_LABEL[d.otherStatus] ?? d.otherStatus) : ''
  return status ? `${d.otherAppNo}（${status}）` : `${d.otherAppNo}`
}

async function toggleNoInvoice(r: object, v: boolean) {
  const row = asRow(r)
  if (v && row.invoices.length > 0) {
    try {
      await ElMessageBox.confirm(`勾选“无票”将移除本行已上传的 ${row.invoices.length} 张票据，是否继续？`, '确认无票', {
        type: 'warning',
        confirmButtonText: '继续',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
    row.invoices = []
  }
  row.noInvoice = v
}

function rowClass({ row }: { row: ExpenseItemDraft }): string {
  return props.readonly && row.noInvoice ? 'row-no-invoice' : ''
}

function add() {
  if (items.value.length < props.maxRows) items.value.push(emptyExpenseItem())
}

function remove(i: number) {
  items.value.splice(i, 1)
}

function typeName(r: object): string {
  const row = asRow(r)
  return row.expenseTypeName ?? dict.expenseTypeName(row.expenseTypeCode)
}
</script>

<template>
  <div class="expense-table">
    <div class="table-scroll" role="region" aria-label="报销明细表" tabindex="0">
      <el-table :data="items" row-key="key" class="table" :class="{ 'table--edit': !readonly }" :row-class-name="rowClass">
        <el-table-column type="index" label="#" width="64" align="center" />
        <el-table-column label="费用类型" width="160">
          <template #default="{ row, $index }">
            <span v-if="readonly">{{ typeName(row) }}</span>
            <div v-else :class="{ 'cell-error': err($index, 'expenseTypeCode') }">
              <el-select v-model="row.expenseTypeCode" placeholder="请选择" clearable>
                <el-option v-for="t in dict.expenseTypes" :key="t.code" :label="t.name" :value="t.code" />
              </el-select>
              <div v-if="err($index, 'expenseTypeCode')" class="cell-error-msg">{{ err($index, 'expenseTypeCode') }}</div>
            </div>
            <div v-if="!readonly && err($index)" class="cell-error-msg">{{ err($index) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="发生日期" width="150">
          <template #default="{ row, $index }">
            <span v-if="readonly">{{ row.occurDate ?? '—' }}</span>
            <div v-else :class="{ 'cell-error': err($index, 'occurDate') }">
              <el-date-picker
                v-model="row.occurDate"
                type="date"
                value-format="YYYY-MM-DD"
                :disabled-date="disabledDate"
                placeholder="选择日期"
                style="width: 100%"
              />
              <div v-if="err($index, 'occurDate')" class="cell-error-msg">{{ err($index, 'occurDate') }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="用途说明" min-width="190">
          <template #default="{ row, $index }">
            <span v-if="readonly" class="pre-wrap">{{ row.purpose ?? '—' }}</span>
            <div v-else :class="{ 'cell-error': err($index, 'purpose') }">
              <el-input v-model="row.purpose" maxlength="200" placeholder="如：北京出差高铁票" />
              <div v-if="err($index, 'purpose')" class="cell-error-msg">{{ err($index, 'purpose') }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额（元）" width="145" align="right">
          <template #default="{ row, $index }">
            <MoneyText v-if="readonly" :cents="row.amountCents" />
            <div v-else :class="{ 'cell-error': err($index, 'amountCents') }">
              <AmountInput v-model:cents="row.amountCents" />
              <div v-if="err($index, 'amountCents')" class="cell-error-msg">{{ err($index, 'amountCents') }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="票据" min-width="320">
          <template #default="{ row, $index }">
            <!-- 只读 -->
            <template v-if="readonly">
              <div v-if="row.noInvoice" class="no-invoice">
                <el-tag type="warning" effect="plain" size="small" disable-transitions>无票</el-tag>
                <span class="pre-wrap small">原因：{{ row.noInvoiceReason ?? '—' }}</span>
              </div>
              <template v-else-if="showAttachments">
                <AttachmentUploader :model-value="invoiceMetas(row)" ref-type="EXPENSE_INVOICE" readonly>
                  <template #extra="{ file }">
                    <div class="invoice-extra">
                      <span v-if="invoiceOf(row, file.id)?.invoiceNo" class="small">
                        票据号：<span class="num">{{ invoiceOf(row, file.id)?.invoiceNo }}</span>
                      </span>
                      <template v-if="namedDups(invoiceOf(row, file.id)).length">
                        <el-tag
                          v-for="(d, k) in namedDups(invoiceOf(row, file.id))"
                          :key="`${d.otherApplicationId ?? k}-${d.attachmentId}`"
                          type="danger"
                          size="small"
                          disable-transitions
                          class="dup-tag"
                        >
                          疑似重复：{{ dupText(d) }}
                        </el-tag>
                      </template>
                      <div v-else-if="suspected(invoiceOf(row, file.id))" class="dup-hint">
                        <el-icon><WarningFilled /></el-icon>该票据疑似已在其他报销单中使用
                      </div>
                    </div>
                  </template>
                </AttachmentUploader>
              </template>
              <span v-else class="muted small">无权查看票据附件</span>
            </template>

            <!-- 编辑 -->
            <template v-else>
              <el-checkbox :model-value="row.noInvoice" @update:model-value="toggleNoInvoice(row, !!$event)">无票</el-checkbox>
              <div v-if="row.noInvoice" :class="{ 'cell-error': err($index, 'noInvoiceReason') }">
                <el-input
                  v-model="row.noInvoiceReason"
                  type="textarea"
                  :rows="2"
                  maxlength="300"
                  show-word-limit
                  placeholder="无票原因（至少 10 字）"
                />
                <div v-if="err($index, 'noInvoiceReason')" class="cell-error-msg">{{ err($index, 'noInvoiceReason') }}</div>
              </div>
              <div v-else :class="{ 'cell-error': err($index, 'invoices') }">
                <AttachmentUploader
                  :model-value="invoiceMetas(row)"
                  ref-type="EXPENSE_INVOICE"
                  :max-count="10"
                  button-text="上传票据"
                  tip="JPEG / PNG / PDF，单个 ≤ 10 MB，每条最多 10 张"
                  @update:model-value="setInvoiceMetas(row, $event)"
                >
                  <template #extra="{ file }">
                    <div class="invoice-extra">
                      <el-input
                        v-if="invoiceOf(row, file.id)"
                        :model-value="invoiceOf(row, file.id)?.invoiceNo ?? ''"
                        @update:model-value="setInvoiceNo(row, file.id, $event)"
                        size="small"
                        maxlength="64"
                        placeholder="票据号（可选）"
                        class="invoice-no"
                      />
                      <div v-if="suspected(invoiceOf(row, file.id))" class="dup-hint">
                        <el-icon><WarningFilled /></el-icon>
                        <span>
                          该票据疑似已在其他报销单中使用<template v-if="namedDups(invoiceOf(row, file.id)).length">
                            （{{ namedDups(invoiceOf(row, file.id)).map(dupText).join('、') }}）</template
                          >，仍可提交，由财务判断
                        </span>
                      </div>
                    </div>
                  </template>
                </AttachmentUploader>
                <div v-if="err($index, 'invoices')" class="cell-error-msg">{{ err($index, 'invoices') }}</div>
              </div>
              <template v-for="(inv, k) in row.invoices" :key="inv.attachment.id">
                <div v-if="err($index, `invoices[${k}]`) || err($index, `invoices[${k}].invoiceNo`)" class="cell-error-msg">
                  票据 {{ k + 1 }}：{{ err($index, `invoices[${k}]`) ?? err($index, `invoices[${k}].invoiceNo`) }}
                </div>
              </template>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="!readonly" label="操作" width="80" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" @click="remove($index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="total-row">
      <span>合计</span>
      <MoneyText :cents="total" strong />
    </div>
    <div v-if="!readonly" class="table-foot">
      <el-button size="small" :icon="Plus" :disabled="items.length >= maxRows" @click="add">添加明细</el-button>
      <span class="muted small">空行不会保存</span>
    </div>
  </div>
</template>

<style scoped>
.expense-table {
  min-width: 0;
}
.table-scroll {
  max-width: 100%;
  overflow-x: auto;
}
.table-foot :deep(.el-button),
.table :deep(.el-button.is-link) {
  min-height: 32px;
}
.table-scroll:focus-visible,
.table-foot :deep(.el-button:focus-visible),
.expense-table :deep(.el-checkbox__original:focus-visible + .el-checkbox__inner) {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.table--edit {
  min-width: 1120px;
}
.table :deep(.el-table__body td.el-table__cell) {
  vertical-align: top;
}
.expense-table :deep(.el-input__wrapper),
.expense-table :deep(.el-select__wrapper),
.expense-table :deep(.el-date-editor.el-input__wrapper) {
  min-height: var(--eas-control-height);
}
.expense-table :deep(.el-textarea__inner) {
  min-height: var(--eas-control-height);
}
.total-row {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 16px;
  padding: 12px 24px;
  background: var(--eas-row-hover);
  color: var(--eas-ink-2);
  border-top: 1px solid var(--eas-rule);
}
.total-row :deep(.money) {
  font-family: var(--eas-font-serif);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--eas-ink);
}
.table-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.no-invoice {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.num {
  font-variant-numeric: tabular-nums;
}
.invoice-extra {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
}
.invoice-no {
  max-width: 220px;
}
.dup-tag {
  align-self: flex-start;
}
.dup-hint {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 2px 6px;
  border-radius: var(--eas-radius-control);
  font-size: var(--eas-fs-12);
  color: var(--eas-warning-text);
  background: var(--eas-warning-tint);
}
</style>
