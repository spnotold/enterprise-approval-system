<script setup lang="ts">
// 采购明细表：可增删行；金额 = 数量 × 单价（multiplyCents，HALF_UP 到分），合计仅供即时显示
import { computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { multiplyCents, sumCents } from '@/lib/money'
import { emptyPurchaseItem, QUANTITY_PARTIAL, type PurchaseItemDraft } from '@/lib/formModels'
import AmountInput from './AmountInput.vue'
import MoneyText from './MoneyText.vue'

const items = defineModel<PurchaseItemDraft[]>({ required: true })

const props = withDefaults(
  defineProps<{
    readonly?: boolean
    /** 取字段错误，路径如 items[2].quantity */
    error?: (path: string) => string | undefined
    prefix?: string
    maxRows?: number
    /** 只读模式下服务端合计 */
    totalCents?: number | null
  }>(),
  { readonly: false, error: () => undefined, prefix: 'items', maxRows: 50, totalCents: null },
)

const err = (i: number, field?: string) => props.error(field ? `${props.prefix}[${i}].${field}` : `${props.prefix}[${i}]`)

function rowAmount(r: object): number | null {
  const row = r as PurchaseItemDraft
  if (props.readonly) return row.amountCents ?? null
  return multiplyCents(row.quantity, row.unitPriceCents)
}

const total = computed(() =>
  props.readonly && props.totalCents != null ? props.totalCents : sumCents(items.value.map(rowAmount)),
)

function onQuantity(r: object, v: string) {
  const row = r as PurchaseItemDraft
  const s = v.replace(/\s/g, '')
  if (QUANTITY_PARTIAL.test(s)) row.quantity = s === '' ? null : s
}

function add() {
  if (items.value.length < props.maxRows) items.value.push(emptyPurchaseItem())
}

function remove(i: number) {
  items.value.splice(i, 1)
}
</script>

<template>
  <div class="item-table">
    <el-table :data="items" border row-key="key" size="small" class="table">
      <el-table-column type="index" label="#" width="44" align="center" />
      <el-table-column label="名称" min-width="150">
        <template #default="{ row, $index }">
          <span v-if="readonly">{{ row.name ?? '—' }}</span>
          <div v-else :class="{ 'cell-error': err($index, 'name') }">
            <el-input v-model="row.name" maxlength="100" placeholder="物品名称" />
            <div v-if="err($index, 'name')" class="cell-error-msg">{{ err($index, 'name') }}</div>
          </div>
          <div v-if="!readonly && err($index)" class="cell-error-msg">{{ err($index) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="规格型号" min-width="130">
        <template #default="{ row, $index }">
          <span v-if="readonly">{{ row.spec ?? '—' }}</span>
          <div v-else :class="{ 'cell-error': err($index, 'spec') }">
            <el-input v-model="row.spec" maxlength="100" />
            <div v-if="err($index, 'spec')" class="cell-error-msg">{{ err($index, 'spec') }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="单位" width="80">
        <template #default="{ row, $index }">
          <span v-if="readonly">{{ row.unit ?? '—' }}</span>
          <div v-else :class="{ 'cell-error': err($index, 'unit') }">
            <el-input v-model="row.unit" maxlength="10" placeholder="台" />
            <div v-if="err($index, 'unit')" class="cell-error-msg">{{ err($index, 'unit') }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="数量" width="110" align="right">
        <template #default="{ row, $index }">
          <span v-if="readonly" class="num">{{ row.quantity ?? '—' }}</span>
          <div v-else :class="{ 'cell-error': err($index, 'quantity') }">
            <el-input
              class="num-input"
              :model-value="row.quantity ?? ''"
              inputmode="decimal"
              placeholder="0"
              @update:model-value="onQuantity(row, $event)"
            />
            <div v-if="err($index, 'quantity')" class="cell-error-msg">{{ err($index, 'quantity') }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="单价（元）" width="140" align="right">
        <template #default="{ row, $index }">
          <MoneyText v-if="readonly" :cents="row.unitPriceCents" />
          <div v-else :class="{ 'cell-error': err($index, 'unitPriceCents') }">
            <AmountInput v-model:cents="row.unitPriceCents" />
            <div v-if="err($index, 'unitPriceCents')" class="cell-error-msg">{{ err($index, 'unitPriceCents') }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="金额（元）" width="130" align="right">
        <template #default="{ row, $index }">
          <MoneyText :cents="rowAmount(row)" />
          <div v-if="!readonly && err($index, 'amountCents')" class="cell-error-msg">{{ err($index, 'amountCents') }}</div>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="120">
        <template #default="{ row }">
          <span v-if="readonly" class="pre-wrap">{{ row.remark ?? '' }}</span>
          <el-input v-else v-model="row.remark" maxlength="200" />
        </template>
      </el-table-column>
      <el-table-column v-if="!readonly" label="操作" width="64" align="center" fixed="right">
        <template #default="{ $index }">
          <el-button link type="danger" :disabled="items.length <= 1" @click="remove($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="table-foot">
      <el-button v-if="!readonly" size="small" :icon="Plus" :disabled="items.length >= maxRows" @click="add">
        添加明细
      </el-button>
      <span class="flex-1" />
      <span>明细合计：<MoneyText :cents="total" strong /></span>
    </div>
    <div v-if="!readonly" class="muted small">金额按“数量 × 单价”四舍五入到分，仅供参考，以服务端计算为准。</div>
  </div>
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}
.num-input :deep(input) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.table-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
</style>
