<script setup lang="ts">
// 报价比较表：最低价高亮（金额相同视为最低价），标出拟选供应商；支持编辑与只读两种模式
import { computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { emptyQuote, isHttpUrl, lowestQuoteCents, type QuoteDraft } from '@/lib/formModels'
import AmountInput from './AmountInput.vue'
import MoneyText from './MoneyText.vue'
import AttachmentUploader from './AttachmentUploader.vue'

const quotes = defineModel<QuoteDraft[]>({ required: true })
/** 拟选报价在 quotes 中的下标 */
const selected = defineModel<number | null>('selected', { default: null })

const props = withDefaults(
  defineProps<{
    readonly?: boolean
    error?: (path: string) => string | undefined
    prefix?: string
    maxRows?: number
    /** 只读模式下是否可预览附件 */
    showAttachments?: boolean
  }>(),
  { readonly: false, error: () => undefined, prefix: 'quotes', maxRows: 10, showAttachments: true },
)

const err = (i: number, field?: string) => props.error(field ? `${props.prefix}[${i}].${field}` : `${props.prefix}[${i}]`)

const lowest = computed(() => lowestQuoteCents(quotes.value))

function isLowest(r: object): boolean {
  const row = r as QuoteDraft
  if (props.readonly && row.lowest !== undefined) return row.lowest
  return row.quoteAmountCents != null && row.quoteAmountCents === lowest.value
}

function rowClass({ row, rowIndex }: { row: QuoteDraft; rowIndex: number }): string {
  return [isLowest(row) ? 'row-lowest' : '', selected.value === rowIndex ? 'row-selected' : ''].join(' ')
}

function add() {
  if (quotes.value.length < props.maxRows) quotes.value.push(emptyQuote())
}

function remove(i: number) {
  quotes.value.splice(i, 1)
  // 维持拟选下标
  if (selected.value === i) selected.value = null
  else if (selected.value !== null && selected.value > i) selected.value -= 1
}
</script>

<template>
  <div class="quote-table">
    <div class="table-scroll" role="region" aria-label="报价比较表" tabindex="0">
      <el-table :data="quotes" row-key="key" class="table" :class="{ 'table--edit': !readonly }" :row-class-name="rowClass">
        <el-table-column label="拟选" width="64" align="center">
          <template #default="{ $index }">
            <el-radio
              v-if="!readonly"
              :model-value="selected ?? undefined"
              :value="$index"
              :aria-label="`选择第 ${$index + 1} 家报价`"
              @update:model-value="selected = $index"
              ><span class="sr-only">拟选</span></el-radio
            >
            <span v-else-if="selected === $index" class="picked">拟选</span>
          </template>
        </el-table-column>
        <el-table-column label="供应商" min-width="180">
          <template #default="{ row, $index }">
            <template v-if="readonly">
              <span>{{ row.supplierName ?? '—' }}</span>
            </template>
            <div v-else :class="{ 'cell-error': err($index, 'supplierName') }">
              <el-input v-model="row.supplierName" maxlength="100" placeholder="供应商名称" />
              <div v-if="err($index, 'supplierName')" class="cell-error-msg">{{ err($index, 'supplierName') }}</div>
            </div>
            <div class="tags">
              <el-tag v-if="isLowest(row)" type="success" size="small" disable-transitions>最低价</el-tag>
              <el-tag v-if="readonly && selected === $index" type="primary" size="small" effect="plain" disable-transitions>
                拟选供应商
              </el-tag>
            </div>
            <div v-if="!readonly && err($index)" class="cell-error-msg">{{ err($index) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="110">
          <template #default="{ row }">
            <span v-if="readonly">{{ row.channel === 'ONLINE' ? '线上' : '线下' }}</span>
            <el-select v-else v-model="row.channel">
              <el-option value="OFFLINE" label="线下" />
              <el-option value="ONLINE" label="线上" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="报价金额（元）" width="155" align="right">
          <template #default="{ row, $index }">
            <MoneyText v-if="readonly" :cents="row.quoteAmountCents" :strong="selected === $index" />
            <div v-else :class="{ 'cell-error': err($index, 'quoteAmountCents') }">
              <AmountInput v-model:cents="row.quoteAmountCents" />
              <div v-if="err($index, 'quoteAmountCents')" class="cell-error-msg">{{ err($index, 'quoteAmountCents') }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="购买链接 / 报价说明" min-width="250">
          <template #default="{ row, $index }">
            <template v-if="readonly">
              <div v-if="row.url">
                <a v-if="isHttpUrl(row.url)" :href="row.url" target="_blank" rel="noopener noreferrer nofollow" class="link">
                  {{ row.url }}
                </a>
                <span v-else class="pre-wrap">{{ row.url }}</span>
              </div>
              <div v-if="row.description" class="pre-wrap small">{{ row.description }}</div>
              <span v-if="!row.url && !row.description" class="muted">—</span>
            </template>
            <template v-else>
              <div :class="{ 'cell-error': err($index, 'url') }">
                <el-input
                  v-model="row.url"
                  maxlength="500"
                  :placeholder="row.channel === 'ONLINE' ? '购买链接（线上报价必填）' : '购买链接（可选）'"
                />
                <div v-if="err($index, 'url')" class="cell-error-msg">{{ err($index, 'url') }}</div>
              </div>
              <div :class="{ 'cell-error': err($index, 'description') }" class="description-field">
                <el-input v-model="row.description" type="textarea" :autosize="{ minRows: 2 }" maxlength="500" placeholder="报价明细说明" />
                <div v-if="err($index, 'description')" class="cell-error-msg">{{ err($index, 'description') }}</div>
              </div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="!readonly || showAttachments" label="报价单 / 截图" min-width="230">
          <template #default="{ row, $index }">
            <div :class="{ 'cell-error': err($index, 'attachmentIds') }">
              <AttachmentUploader
                v-model="row.attachments"
                ref-type="PURCHASE_QUOTE"
                :readonly="readonly"
                :max-count="5"
                button-text="上传"
                :tip="row.channel === 'ONLINE' ? '线上报价需至少 1 张截图' : '线下报价需报价单或填写说明'"
              />
              <div v-if="err($index, 'attachmentIds')" class="cell-error-msg">{{ err($index, 'attachmentIds') }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="!readonly" label="操作" width="80" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" @click="remove($index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div v-if="!readonly" class="table-foot">
      <el-button size="small" :icon="Plus" :disabled="quotes.length >= maxRows" @click="add">添加报价</el-button>
      <span class="muted small">非单一来源采购至少需 2 家不同供应商报价。最低价已标记。</span>
    </div>
  </div>
</template>

<style scoped>
.quote-table {
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
.quote-table :deep(.el-radio__original:focus-visible + .el-radio__inner),
.quote-table .link:focus-visible {
  outline: 2px solid var(--eas-ink);
  outline-offset: 2px;
}
.table--edit {
  min-width: 1100px;
}
.table :deep(.el-table__body td.el-table__cell) {
  vertical-align: top;
}
.quote-table :deep(.el-input__wrapper),
.quote-table :deep(.el-select__wrapper) {
  min-height: var(--eas-control-height);
}
.quote-table :deep(.el-textarea__inner) {
  min-height: var(--eas-control-height);
}
/* 登记簿金额：展示字 16，右对齐 */
.quote-table .table :deep(.money) {
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-md);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.description-field {
  margin-top: 4px;
}
.tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.tags:empty {
  display: none;
}
.picked {
  color: var(--eas-primary);
  font-size: var(--eas-fs-xs);
  font-weight: 600;
}
.table-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.link {
  color: var(--eas-link);
  word-break: break-all;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
