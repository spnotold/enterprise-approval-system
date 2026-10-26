<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AttachmentPicker from '@/components/AttachmentPicker.vue'
import FormItem from '@/components/FormItem.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import StepBar from '@/components/StepBar.vue'
import { useDraft } from '@/composables/useDraft'
import { applyApiError, remapIndex, scrollToError, useFieldErrors } from '@/composables/useFieldErrors'
import { formatCents, multiplyCents, sumCents } from '@/lib/money'
import { requireLogin } from '@/stores/auth'
import { emptyPurchase, emptyPurchaseItem, emptyQuote, lowestQuote, purchaseBody, rowKey, validatePurchase } from '@/utils/applyForms'
import { hideLoading, loading, showError, toast } from '@/utils/feedback'
import { SWITCH_COLOR } from '@/utils/palette'
import { todayCN } from '@/utils/time'

const form = reactive(emptyPurchase())
const fe = useFieldErrors()
const { draft, trackDirty, startTracking, markClean, load, save, submit, finishSubmit } = useDraft('purchase')
const ready = ref(false), loadError = ref(''), step = ref(0)
const steps = ['基本信息', '采购明细', '报价比较', '采购选择', '附件', '确认']
const busyUploads = reactive<Record<string, boolean>>({})
const uploading = computed(() => Object.values(busyUploads).some(Boolean))
const lowest = computed(() => lowestQuote(form.quotes))
const selected = computed(() => form.selectedQuoteIndex === null ? null : form.quotes[form.selectedQuoteIndex] ?? null)
const notLowest = computed(() => selected.value?.quoteAmountCents != null && lowest.value !== null && selected.value.quoteAmountCents > lowest.value)
const total = computed(() => sumCents(form.items.map(i => multiplyCents(i.quantity, i.unitPriceCents))))
// 聚焦中的输入框 key；小程序没有 :focus，用 @focus / @blur 切换 .is-focus
const foc = ref('')
const ic = (k: string, path = k) => ({ 'is-focus': foc.value === k, 'is-error': !!fe.get(path) })
const errorSteps = computed(() => [...new Set(Object.keys(fe.map).map(fieldStep))])
let itemMap: number[] = [], quoteMap: number[] = [], initialId: number | null = null

function fieldStep(path: string): number {
  if (path.startsWith('items')) return 1
  if (path.startsWith('quotes')) return 2
  if (/^(selectedQuoteIndex|selectionReason|notLowestReason)/.test(path)) return 3
  if (path.startsWith('attachmentIds')) return 4
  return 0
}
function locate(): void {
  const first = Object.keys(fe.map)[0]
  if (first) step.value = fieldStep(first)
  scrollToError()
}
function remap(field: string): string | null {
  if (!/^(title|reason|budgetLimitCents|expectedArrivalDate|singleSourceReason|singleSourceAttachmentIds|selectedQuoteIndex|selectionReason|notLowestReason|items|quotes|attachmentIds)(?:$|\[|\.)/.test(field)) return null
  const item = remapIndex(field, 'items', itemMap)
  return item === null ? null : remapIndex(item, 'quotes', quoteMap)
}
function changeStep(index: number): void {
  if (draft.busy) return
  step.value = index
  uni.pageScrollTo({ scrollTop: 0, duration: 150 })
}
function removeItem(i: number): void {
  if (draft.busy) return
  form.items.splice(i, 1); fe.clearUnder('items')
}
function removeQuote(i: number): void {
  if (draft.busy || busyUploads[`quote-${form.quotes[i].key}`]) return toast('请等待上传完成或取消上传')
  delete busyUploads[`quote-${form.quotes[i].key}`]
  form.quotes.splice(i, 1)
  if (form.selectedQuoteIndex === i) form.selectedQuoteIndex = null
  else if (form.selectedQuoteIndex !== null && form.selectedQuoteIndex > i) form.selectedQuoteIndex--
  fe.clearUnder('quotes'); fe.clearField('selectedQuoteIndex')
}
function toggleSingle(): void { form.singleSource = !form.singleSource; fe.clearUnder('singleSourceReason') }

async function fill(id: number): Promise<void> {
  ready.value = false; loadError.value = ''; loading()
  try {
    const d = await load(id)
    if (!d) return
    if (!d.purchase) throw new Error('采购草稿内容不完整')
    const p = d.purchase
    Object.assign(form, {
      title: d.title ?? '', reason: p.reason ?? '', budgetLimitCents: p.budgetLimitCents,
      expectedArrivalDate: p.expectedArrivalDate ?? '', singleSource: p.singleSource, singleSourceReason: p.singleSourceReason ?? '',
      singleSourceAttachments: [...p.singleSourceAttachments], selectedQuoteIndex: p.selectedQuoteIndex, selectionReason: p.selectionReason ?? '', notLowestReason: p.notLowestReason ?? '',
      items: p.items.length ? p.items.map(i => ({ ...i, key: rowKey() })) : [emptyPurchaseItem()],
      quotes: p.quotes.length ? p.quotes.map(q => ({ key: rowKey(), supplierName: q.supplierName ?? '', channel: q.channel, quoteAmountCents: q.quoteAmountCents, url: q.url ?? '', description: q.description ?? '', attachments: [...q.attachments] })) : [emptyQuote(), emptyQuote()],
      attachments: [...p.attachments],
    })
    fe.clear(); markClean(); ready.value = true
  } catch (e) { loadError.value = '草稿加载失败，请重试'; showError(e) }
  finally { hideLoading() }
}
async function reloadDraft(): Promise<void> { if (draft.id) await fill(draft.id) }
async function retry(): Promise<void> { if (initialId) await fill(initialId) }
async function act(full: boolean): Promise<void> {
  if (!ready.value || draft.busy) return
  if (uploading.value) return toast('附件上传中，请稍候')
  fe.setAll(validatePurchase(form, full))
  if (fe.count.value) { toast('请完善标红的内容'); return locate() }
  const data = purchaseBody(form)
  itemMap = data.itemMap; quoteMap = data.quoteMap
  try {
    if (full) { const r = await submit(data.body); if (r) { ready.value = false; finishSubmit(r) } }
    else { loading('保存中'); await save(data.body) }
  } catch (e) { if (applyApiError(fe, e, { remap, onRefresh: reloadDraft })) locate() }
  finally { hideLoading() }
}

onLoad(async q => {
  if (!(await requireLogin())) return
  trackDirty(() => form)
  if (q?.id) {
    initialId = Number(q.id)
    if (!Number.isSafeInteger(initialId) || initialId <= 0) { loadError.value = '草稿编号无效'; return }
    await fill(initialId)
  } else ready.value = true
  startTracking()
})
</script>

<template>
  <view class="page page--bar">
    <view v-if="loadError" class="banner banner-danger">
      {{ loadError }}
      <view class="link-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="retry">重试</view>
    </view>
    <template v-if="ready">
      <view v-if="draft.appNo" class="draft-no">
        <text>草稿 {{ draft.appNo }}</text>
        <text v-if="draft.dirty" class="draft-dirty">未保存</text>
      </view>
      <StepBar :steps="steps" :current="step" :error-steps="errorSteps" @change="changeStep" />
      <view v-if="fe.general.value.length" class="banner banner-danger">
        <view v-for="m in fe.general.value" :key="m">{{ m }}</view>
      </view>
      <view :class="{ locked: draft.busy }">
        <view v-show="step === 0">
          <view class="card">
            <view class="card-title"><view class="ink-glyph ink-glyph--stack" /><text class="flex1">申请信息</text></view>
            <FormItem label="标题" required :error="fe.get('title')">
              <input
                v-model="form.title"
                class="input"
                :class="ic('title')"
                maxlength="100"
                placeholder="简要说明本次采购"
                @input="fe.clearField('title')"
                @focus="foc = 'title'"
                @blur="foc = ''"
              />
            </FormItem>
            <FormItem label="采购事由" required :error="fe.get('reason')">
              <textarea
                v-model="form.reason"
                class="textarea"
                :class="ic('reason')"
                maxlength="1000"
                auto-height
                placeholder="说明采购用途与必要性"
                @input="fe.clearField('reason')"
                @focus="foc = 'reason'"
                @blur="foc = ''"
              />
            </FormItem>
            <FormItem label="预算上限" required :error="fe.get('budgetLimitCents')">
              <MoneyInput v-model="form.budgetLimitCents" :error="!!fe.get('budgetLimitCents')" @update:model-value="fe.clearField('budgetLimitCents')" />
            </FormItem>
            <FormItem label="期望到货日期" required :error="fe.get('expectedArrivalDate')">
              <picker
                mode="date"
                :value="form.expectedArrivalDate"
                :start="todayCN()"
                @change="form.expectedArrivalDate = $event.detail.value; fe.clearField('expectedArrivalDate')"
              >
                <view class="picker-value" :class="ic('expectedArrivalDate')" hover-class="is-pressed" :hover-stay-time="60">
                  <text :class="{ placeholder: !form.expectedArrivalDate }">{{ form.expectedArrivalDate || '请选择日期' }}</text>
                  <uni-icons type="calendar" size="18" color="var(--eas-ink-3)" />
                </view>
              </picker>
            </FormItem>
          </view>
          <view class="card">
            <view class="card-title switch-title">
              <text>单一来源采购</text>
              <switch :checked="form.singleSource" :color="SWITCH_COLOR" @change="toggleSingle" />
            </view>
            <view v-show="form.singleSource">
              <FormItem label="单一来源说明" required :error="fe.get('singleSourceReason')" help="至少 20 字，附说明材料或在说明中写明依据">
                <textarea
                  v-model="form.singleSourceReason"
                  class="textarea"
                  :class="ic('singleSourceReason')"
                  maxlength="1000"
                  auto-height
                  placeholder="说明唯一供应商与采购依据"
                  @input="fe.clearField('singleSourceReason')"
                  @focus="foc = 'singleSourceReason'"
                  @blur="foc = ''"
                />
              </FormItem>
              <FormItem label="说明材料" :error="fe.first('singleSourceAttachmentIds')">
                <AttachmentPicker
                  v-model="form.singleSourceAttachments"
                  ref-type="SINGLE_SOURCE"
                  @busy="busyUploads.single = $event"
                  @update:model-value="fe.clearUnder('singleSourceAttachmentIds')"
                />
              </FormItem>
            </view>
          </view>
        </view>

        <view v-show="step === 1" class="card detail-sheet">
          <view class="card-title">采购明细</view>
          <view class="row between group-sum">
            <text class="sum-label">合计</text>
            <text class="amount">¥{{ formatCents(total) }}</text>
          </view>
          <view v-if="fe.get('items')" class="field-err page-err">{{ fe.get('items') }}</view>
          <view v-for="(it, i) in form.items" :key="it.key" class="detail-block">
            <view class="detail-title row between">
              <text>明细 {{ i + 1 }}</text>
              <view class="link-btn danger" hover-class="is-pressed" :hover-stay-time="60" @tap="removeItem(i)">删除</view>
            </view>
            <FormItem label="名称" required :error="fe.get(`items[${i}].name`)">
              <input
                v-model="it.name"
                class="input"
                :class="ic(`in${i}`, `items[${i}].name`)"
                maxlength="100"
                placeholder="物品名称"
                @input="fe.clearField(`items[${i}].name`)"
                @focus="foc = `in${i}`"
                @blur="foc = ''"
              />
            </FormItem>
            <FormItem label="规格型号" :error="fe.get(`items[${i}].spec`)">
              <input
                v-model="it.spec"
                class="input"
                :class="ic(`is${i}`, `items[${i}].spec`)"
                maxlength="200"
                placeholder="选填"
                @focus="foc = `is${i}`"
                @blur="foc = ''"
              />
            </FormItem>
            <view class="row two">
              <FormItem class="flex1" label="数量" required :error="fe.get(`items[${i}].quantity`)">
                <input
                  v-model="it.quantity"
                  class="input num"
                  :class="ic(`iq${i}`, `items[${i}].quantity`)"
                  type="digit"
                  maxlength="13"
                  placeholder="最多 3 位小数"
                  @input="fe.clearField(`items[${i}].quantity`)"
                  @focus="foc = `iq${i}`"
                  @blur="foc = ''"
                />
              </FormItem>
              <FormItem class="flex1" label="单位" required :error="fe.get(`items[${i}].unit`)">
                <input
                  v-model="it.unit"
                  class="input"
                  :class="ic(`iu${i}`, `items[${i}].unit`)"
                  maxlength="20"
                  placeholder="如 台、件"
                  @input="fe.clearField(`items[${i}].unit`)"
                  @focus="foc = `iu${i}`"
                  @blur="foc = ''"
                />
              </FormItem>
            </view>
            <FormItem label="单价" required :error="fe.get(`items[${i}].unitPriceCents`)">
              <MoneyInput v-model="it.unitPriceCents" :error="!!fe.get(`items[${i}].unitPriceCents`)" @update:model-value="fe.clearField(`items[${i}].unitPriceCents`)" />
            </FormItem>
            <view class="row between item-sum">
              <text class="sum-label">金额</text>
              <text class="amount">¥{{ formatCents(multiplyCents(it.quantity, it.unitPriceCents)) }}</text>
            </view>
            <FormItem label="备注" :error="fe.get(`items[${i}].remark`)">
              <input
                v-model="it.remark"
                class="input"
                :class="ic(`ir${i}`, `items[${i}].remark`)"
                maxlength="200"
                placeholder="选填"
                @focus="foc = `ir${i}`"
                @blur="foc = ''"
              />
            </FormItem>
          </view>
          <button
            class="btn btn-block"
            :disabled="form.items.length >= 50"
            hover-class="is-pressed"
            :hover-stay-time="60"
            @tap="form.items.push(emptyPurchaseItem()); fe.clearUnder('items')"
          >添加明细</button>
        </view>

        <view v-show="step === 2" class="card detail-sheet">
          <view class="card-title">{{ steps[2] }}</view>
          <view class="banner banner-info quote-help">非单一来源至少 2 家供应商；线上报价需链接及截图，线下需报价单或说明。</view>
          <view v-if="fe.get('quotes')" class="field-err page-err">{{ fe.get('quotes') }}</view>
          <view v-for="(q, i) in form.quotes" :key="q.key" class="detail-block" :class="{ lowest: q.quoteAmountCents !== null && q.quoteAmountCents === lowest }">
            <view class="detail-title row between">
              <view class="row">
                <text>报价 {{ i + 1 }}</text>
                <text v-if="q.quoteAmountCents !== null && q.quoteAmountCents === lowest" class="tag tag-green tag-gap">最低价</text>
              </view>
              <view class="link-btn danger" hover-class="is-pressed" :hover-stay-time="60" @tap="removeQuote(i)">删除</view>
            </view>
            <FormItem label="供应商" required :error="fe.get(`quotes[${i}].supplierName`)">
              <input
                v-model="q.supplierName"
                class="input"
                :class="ic(`qs${i}`, `quotes[${i}].supplierName`)"
                maxlength="200"
                placeholder="供应商名称"
                @input="fe.clearField(`quotes[${i}].supplierName`)"
                @focus="foc = `qs${i}`"
                @blur="foc = ''"
              />
            </FormItem>
            <view class="modes">
              <view
                class="mode"
                :class="{ chosen: q.channel === 'OFFLINE' }"
                hover-class="is-pressed"
                :hover-stay-time="60"
                @tap="q.channel = 'OFFLINE'; fe.clearUnder(`quotes[${i}]`)"
              >线下报价</view>
              <view
                class="mode"
                :class="{ chosen: q.channel === 'ONLINE' }"
                hover-class="is-pressed"
                :hover-stay-time="60"
                @tap="q.channel = 'ONLINE'; fe.clearUnder(`quotes[${i}]`)"
              >线上报价</view>
            </view>
            <FormItem label="报价金额" required :error="fe.get(`quotes[${i}].quoteAmountCents`)">
              <MoneyInput v-model="q.quoteAmountCents" :error="!!fe.get(`quotes[${i}].quoteAmountCents`)" @update:model-value="fe.clearField(`quotes[${i}].quoteAmountCents`)" />
            </FormItem>
            <FormItem label="购买链接" :required="q.channel === 'ONLINE'" :error="fe.get(`quotes[${i}].url`)">
              <input
                v-model="q.url"
                class="input"
                :class="ic(`qu${i}`, `quotes[${i}].url`)"
                maxlength="1000"
                placeholder="http:// 或 https://"
                @input="fe.clearField(`quotes[${i}].url`)"
                @focus="foc = `qu${i}`"
                @blur="foc = ''"
              />
            </FormItem>
            <FormItem label="报价明细说明" :error="fe.get(`quotes[${i}].description`)">
              <textarea
                v-model="q.description"
                class="textarea"
                :class="ic(`qd${i}`, `quotes[${i}].description`)"
                maxlength="1000"
                auto-height
                placeholder="配置、交付与售后等"
                @focus="foc = `qd${i}`"
                @blur="foc = ''"
              />
            </FormItem>
            <FormItem label="报价单 / 截图" :required="q.channel === 'ONLINE'" :error="fe.first(`quotes[${i}].attachmentIds`)">
              <AttachmentPicker
                v-model="q.attachments"
                ref-type="PURCHASE_QUOTE"
                @busy="busyUploads[`quote-${q.key}`] = $event"
                @update:model-value="fe.clearUnder(`quotes[${i}].attachmentIds`)"
              />
            </FormItem>
          </view>
          <button
            class="btn btn-block"
            :disabled="form.quotes.length >= 50"
            hover-class="is-pressed"
            :hover-stay-time="60"
            @tap="form.quotes.push(emptyQuote()); fe.clearUnder('quotes')"
          >添加报价</button>
        </view>

        <view v-show="step === 3" class="card">
          <view class="card-title">采购选择</view>
          <FormItem label="拟选供应商" required :error="fe.get('selectedQuoteIndex')">
            <view
              v-for="(q, i) in form.quotes"
              :key="q.key"
              class="quote-option"
              :class="{ chosen: form.selectedQuoteIndex === i }"
              hover-class="is-pressed"
              :hover-stay-time="60"
              @tap="form.selectedQuoteIndex = i; fe.clearField('selectedQuoteIndex')"
            >
              <text class="quote-name">{{ q.supplierName || `报价 ${i + 1}` }}</text>
              <text v-if="q.quoteAmountCents !== null && q.quoteAmountCents === lowest" class="tag tag-green">最低价</text>
              <text class="amount">¥{{ formatCents(q.quoteAmountCents) }}</text>
            </view>
          </FormItem>
          <FormItem label="选择理由" :error="fe.get('selectionReason')">
            <textarea
              v-model="form.selectionReason"
              class="textarea"
              :class="ic('selectionReason')"
              maxlength="500"
              auto-height
              placeholder="说明供应商选择依据"
              @input="fe.clearField('selectionReason')"
              @focus="foc = 'selectionReason'"
              @blur="foc = ''"
            />
          </FormItem>
          <FormItem v-if="notLowest" label="未选最低价理由" required :error="fe.get('notLowestReason')" help="至少 10 字">
            <textarea
              v-model="form.notLowestReason"
              class="textarea"
              :class="ic('notLowestReason')"
              maxlength="500"
              auto-height
              placeholder="说明价格之外的考虑"
              @input="fe.clearField('notLowestReason')"
              @focus="foc = 'notLowestReason'"
              @blur="foc = ''"
            />
          </FormItem>
        </view>

        <view v-show="step === 4" class="card">
          <view class="card-title">其他附件（选填）</view>
          <AttachmentPicker
            v-model="form.attachments"
            ref-type="PURCHASE_ATTACHMENT"
            :error="fe.first('attachmentIds')"
            @busy="busyUploads.other = $event"
            @update:model-value="fe.clearUnder('attachmentIds')"
          />
        </view>

        <view v-show="step === 5" class="card">
          <view class="card-title">确认申请</view>
          <view class="kv"><text class="kv-label">标题</text><text class="kv-value">{{ form.title || '未填写' }}</text></view>
          <view class="kv"><text class="kv-label">采购事由</text><text class="kv-value">{{ form.reason || '未填写' }}</text></view>
          <view class="kv group-sum"><text class="kv-label">明细合计</text><text class="kv-value kv-amount amount">¥{{ formatCents(total) }}</text></view>
          <view class="kv"><text class="kv-label">预算上限</text><text class="kv-value kv-amount">¥{{ formatCents(form.budgetLimitCents) }}</text></view>
          <view class="kv"><text class="kv-label">拟选供应商</text><text class="kv-value">{{ selected?.supplierName || '未选择' }}</text></view>
          <view class="kv"><text class="kv-label">拟选金额</text><text class="kv-value kv-amount">¥{{ formatCents(selected?.quoteAmountCents) }}</text></view>
          <view v-if="form.singleSource" class="banner banner-danger">单一来源：{{ form.singleSourceReason }}</view>
          <view v-if="notLowest" class="banner banner-danger">未选最低价：{{ form.notLowestReason || '请填写理由' }}</view>
          <view class="field-help">提交前会保存最新内容并预览审批路径，确认后进入审批。</view>
        </view>
      </view>
      <view class="row between mt">
        <view v-if="step > 0" class="link-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="changeStep(step - 1)">上一步</view>
        <view v-if="step < 5" class="link-btn next" hover-class="is-pressed" :hover-stay-time="60" @tap="changeStep(step + 1)">下一步</view>
      </view>
    </template>
    <view class="bottom-bar">
      <button class="btn" :disabled="!ready || draft.busy || uploading" hover-class="is-pressed" :hover-stay-time="60" @tap="act(false)">保存草稿</button>
      <button class="btn btn-primary" :disabled="!ready || draft.busy || uploading" hover-class="press-primary" :hover-stay-time="60" @tap="act(true)">提交</button>
    </view>
  </view>
</template>

<style scoped>
@import '../../styles/form.css';

.locked {
  pointer-events: none;
  opacity: 0.7;
}

.draft-no {
  margin: 0 8rpx 16rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}

.draft-dirty {
  margin-left: 20rpx;
  color: var(--eas-warning-text);
}

.two > .flex1 + .flex1 {
  margin-left: 16rpx;
}

.num {
  font-variant-numeric: tabular-nums;
}

.detail-sheet {
  padding-bottom: 32rpx;
}

.detail-block {
  margin: 24rpx 0;
  padding: 0 24rpx 16rpx;
  background: var(--eas-row-hover);
  border-radius: var(--eas-radius-control);
}

.detail-title {
  min-height: 88rpx;
  font-size: var(--eas-fs-md);
  font-weight: 600;
  color: var(--eas-ink);
}

.group-sum,
.item-sum {
  padding: 16rpx 20rpx;
  background: var(--eas-row-hover);
  border-radius: var(--eas-radius-control);
}

.group-sum {
  margin: 20rpx 0;
}

.amount,
.kv-amount {
  text-align: right;
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
}

.sum-label {
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}

.switch-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tag-gap {
  margin-left: 12rpx;
}

.quote-help {
  margin-top: 24rpx;
}

.quote-option {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
  min-height: 96rpx;
  padding: 16rpx 20rpx;
  margin: 0 8rpx 20rpx 0;
  background: var(--eas-row-hover);
  border-radius: var(--eas-radius-control);
}

.quote-option.chosen {
  background: var(--eas-tab);
  box-shadow: var(--eas-offset-mark);
}

.quote-option.chosen.is-pressed {
  background-color: var(--eas-tab) !important;
}

.quote-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.quote-option .amount {
  margin-left: auto;
}

.next {
  margin-left: auto;
}
.page-err {
  margin: 0 8rpx 16rpx;
}
</style>
