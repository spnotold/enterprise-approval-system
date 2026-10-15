<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import type { DupInvoiceWarning, LinkableApplication } from '@/lib/types'
import { formatCents, sumCents } from '@/lib/money'
import AttachmentPicker from '@/components/AttachmentPicker.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import FormItem from '@/components/FormItem.vue'
import LinkedAppCard from '@/components/LinkedAppCard.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import { useDraft } from '@/composables/useDraft'
import { applyApiError, remapIndex, scrollToError, useFieldErrors } from '@/composables/useFieldErrors'
import { requireLogin } from '@/stores/auth'
import { dict } from '@/stores/dict'
import { emptyExpense, emptyExpenseRow, expenseBody, rowKey, validateExpense, type ExpenseRow } from '@/utils/applyForms'
import { confirm, hideLoading, loading, showError, toast } from '@/utils/feedback'
import { goDetail } from '@/utils/nav'
import { addDays, todayCN } from '@/utils/time'

const form = reactive(emptyExpense())
const fe = useFieldErrors()
const { draft, trackDirty, startTracking, markClean, load, save, submit, finishSubmit } = useDraft('expense')
const ready = ref(false), loadError = ref(''), choosing = ref(false), linkLoading = ref(false), linkFailed = ref(false)
const linkable = ref<LinkableApplication[]>([]), savedRelated = ref<LinkableApplication[]>([])
const duplicates = ref<DupInvoiceWarning[]>([]), duplicateFailed = ref(false)
const busyUploads = reactive<Record<number, boolean>>({})
const uploading = computed(() => Object.values(busyUploads).some(Boolean))
const types = computed(() => dict.state.expenseTypes)
const total = computed(() => sumCents(form.items.map(r => r.amountCents)))
const noInvoiceRows = computed(() => form.items.filter(r => r.noInvoice))
const noInvoiceTotal = computed(() => sumCents(noInvoiceRows.value.map(r => r.amountCents)))
const linkOptions = computed(() => [...new Map([...savedRelated.value, ...linkable.value].map(a => [a.id, a])).values()])
const selectedLinks = computed(() => linkOptions.value.filter(a => form.relatedApplicationIds.includes(a.id)))
const warnings = computed<Record<number, string>>(() => Object.fromEntries(duplicates.value.map(d => [d.attachmentId, '该票据疑似已在其他报销单中使用，请核对；仍可提交。'])))
let initialId: number | null = null, itemMap: number[] = []

async function loadLinks(): Promise<void> {
  if (linkLoading.value) return
  linkLoading.value = true; linkFailed.value = false
  try { linkable.value = await api.applications.linkable() }
  catch (e) { linkFailed.value = true; showError(e) }
  finally { linkLoading.value = false }
}
function toggleLink(id: number): void {
  const i = form.relatedApplicationIds.indexOf(id)
  if (i < 0) form.relatedApplicationIds.push(id)
  else form.relatedApplicationIds.splice(i, 1)
  fe.clearUnder('relatedApplicationIds')
}
async function loadDuplicates(id: number): Promise<string> {
  duplicateFailed.value = false
  try { duplicates.value = await api.applications.invoiceDuplicates(id) }
  catch { duplicates.value = []; duplicateFailed.value = true }
  return duplicates.value.length ? '该票据疑似已在其他报销单中使用，请核对后提交。' : duplicateFailed.value ? '暂时无法核对跨单重复票据，请自行核对。' : ''
}
async function removeRow(i: number): Promise<void> {
  const row = form.items[i]
  if (draft.busy) return
  if (busyUploads[row.key]) return toast('请等待上传完成或取消上传')
  if (!(await confirm({ content: `删除第 ${i + 1} 条费用明细及其票据？`, confirmText: '删除', danger: true }))) return
  delete busyUploads[row.key]
  form.items.splice(i, 1); fe.clearUnder('items')
}
async function toggleNoInvoice(row: ExpenseRow): Promise<void> {
  if (draft.busy || busyUploads[row.key]) return
  if (!row.noInvoice && row.attachments.length) {
    if (!(await confirm({ content: '改为无票将移除该明细的票据，是否继续？', confirmText: '改为无票', danger: true }))) return
    row.attachments = []; row.invoiceNos = []
  }
  row.noInvoice = !row.noInvoice
  fe.clearUnder(`items[${form.items.indexOf(row)}]`)
}
function pickType(row: ExpenseRow, e: { detail: { value: number | string } }): void {
  row.expenseTypeCode = types.value[Number(e.detail.value)]?.code ?? ''
  fe.clearField(`items[${form.items.indexOf(row)}].expenseTypeCode`)
}
function typeName(row: ExpenseRow): string {
  return types.value.find(t => t.code === row.expenseTypeCode)?.name ?? (row.expenseTypeCode ? `${row.expenseTypeCode}（已停用，请重选）` : '请选择费用类型')
}
async function fill(id: number): Promise<void> {
  ready.value = false; loadError.value = ''; loading()
  try {
    const d = await load(id)
    if (!d) return
    if (!d.expense) throw new Error('报销草稿内容不完整')
    const e = d.expense
    savedRelated.value = [...e.related]
    const rows: ExpenseRow[] = e.items.map(r => ({ key: rowKey(), expenseTypeCode: r.expenseTypeCode ?? '', occurDate: r.occurDate ?? '', purpose: r.purpose ?? '', amountCents: r.amountCents, noInvoice: r.noInvoice, noInvoiceReason: r.noInvoiceReason ?? '', attachments: r.invoices.map(v => v.attachment), invoiceNos: r.invoices.map(v => v.invoiceNo ?? '') }))
    while (rows.length < 3) rows.push(emptyExpenseRow())
    Object.assign(form, { title: d.title ?? '', description: e.description ?? '', linkMode: e.relatedApplicationIds.length || !e.independentReason ? 'RELATED' : 'INDEPENDENT', relatedApplicationIds: [...e.relatedApplicationIds], independentReason: e.independentReason ?? '', items: rows })
    fe.clear(); markClean(); ready.value = true
    await loadDuplicates(id)
  } catch (e) { loadError.value = '草稿加载失败，请重试'; showError(e) }
  finally { hideLoading() }
}
async function reloadDraft(): Promise<void> { if (draft.id) await fill(draft.id) }
async function initialize(): Promise<void> {
  ready.value = false; loadError.value = ''; loading()
  try {
    await dict.loadExpenseTypes()
    if (initialId) await fill(initialId)
    else ready.value = true
  } catch (e) { loadError.value = '费用类型加载失败，请重试'; showError(e) }
  finally { hideLoading() }
}
async function act(full: boolean): Promise<void> {
  if (!ready.value || draft.busy) return
  if (uploading.value) return toast('票据上传中，请稍候')
  fe.setAll(validateExpense(form, full, types.value.map(t => t.code)))
  if (fe.count.value) { toast('请完善标红的内容'); return scrollToError() }
  const data = expenseBody(form); itemMap = data.itemMap
  try {
    if (full) { const r = await submit(data.body, { afterSave: loadDuplicates }); if (r) { ready.value = false; finishSubmit(r) } }
    else { loading('保存中'); const r = await save(data.body); await loadDuplicates(r.id) }
  } catch (e) {
    applyApiError(fe, e, {
      remap: f => /^(title|description|relatedApplicationIds|independentReason|items)(?:$|\[|\.)/.test(f) ? remapIndex(f, 'items', itemMap) : null,
      onRefresh: reloadDraft,
    })
  }
  finally { hideLoading() }
}
onLoad(async q => {
  if (!(await requireLogin())) return
  trackDirty(() => form)
  if (q?.id) {
    initialId = Number(q.id)
    if (!Number.isSafeInteger(initialId) || initialId <= 0) { loadError.value = '草稿编号无效'; return }
  }
  await initialize()
  startTracking()
  void loadLinks()
})
</script>

<template>
  <view class="page page--bar expense-page">
    <view v-if="loadError" class="banner banner-danger">{{ loadError }}<view class="link-btn" @tap="initialize">重试</view></view>
    <template v-if="ready">
      <view v-if="draft.appNo" class="muted mb">草稿 {{ draft.appNo }}{{ draft.dirty ? ' · 未保存' : '' }}</view>
      <view v-if="fe.general.value.length" class="banner banner-danger"><view v-for="m in fe.general.value" :key="m">{{ m }}</view></view>
      <view v-if="duplicates.length" class="banner banner-warning">该票据疑似已在其他报销单中使用，请核对；仍可提交。</view>
      <view v-if="duplicateFailed" class="banner banner-warning">跨单重复票据核对暂不可用，保存或提交时会重试。</view>
      <view v-if="noInvoiceRows.length" class="banner banner-warning">含 {{ noInvoiceRows.length }} 条无票支出，合计 ¥{{ formatCents(noInvoiceTotal) }}</view>
      <view :class="{ locked: draft.busy }">
        <view class="card">
          <view class="card-title">报销信息</view>
          <FormItem label="标题" required :error="fe.get('title')"><input v-model="form.title" class="input" maxlength="100" placeholder="如 本月出差报销" @input="fe.clearField('title')" /></FormItem>
          <FormItem label="报销说明" :error="fe.get('description')"><textarea v-model="form.description" class="textarea" maxlength="1000" auto-height placeholder="选填，说明报销背景" @input="fe.clearField('description')" /></FormItem>
          <view class="row modes"><view class="link-btn" :class="{ chosen: form.linkMode === 'RELATED' }" @tap="form.linkMode = 'RELATED'; fe.clearField('independentReason')">关联申请</view><view class="link-btn" :class="{ chosen: form.linkMode === 'INDEPENDENT' }" @tap="form.linkMode = 'INDEPENDENT'; fe.clearField('relatedApplicationIds')">独立报销</view></view>
          <FormItem v-if="form.linkMode === 'RELATED'" label="关联申请" required :error="fe.first('relatedApplicationIds')">
            <button class="btn btn-block" @tap="choosing = true">选择本人已通过的差旅 / 采购单</button>
            <view v-for="a in selectedLinks" :key="a.id" class="mt"><LinkedAppCard :app="a" selected /><view class="row between"><view class="link-btn" @tap="goDetail(a.id)">查看详情</view><view class="link-btn danger" @tap="toggleLink(a.id)">取消关联</view></view></view>
          </FormItem>
          <FormItem v-else label="独立报销说明" required :error="fe.get('independentReason')"><textarea v-model="form.independentReason" class="textarea" maxlength="500" auto-height placeholder="说明未关联申请的原因" @input="fe.clearField('independentReason')" /></FormItem>
        </view>
        <view v-if="fe.get('items')" class="field-err">{{ fe.get('items') }}</view>
        <view v-for="(row, i) in form.items" :key="row.key" class="card" :class="{ 'no-invoice': row.noInvoice }">
          <view class="card-title">费用明细 {{ i + 1 }}<view class="link-btn danger" @tap="removeRow(i)">删除</view></view>
          <FormItem label="费用类型" required :error="fe.get(`items[${i}].expenseTypeCode`)"><picker :range="types" range-key="name" :value="Math.max(0, types.findIndex(t => t.code === row.expenseTypeCode))" @change="pickType(row, $event)"><view class="picker-value">{{ typeName(row) }}<uni-icons type="right" size="16" color="#8f959e" /></view></picker></FormItem>
          <FormItem label="发生日期" required :error="fe.get(`items[${i}].occurDate`)"><picker mode="date" :value="row.occurDate" :start="addDays(todayCN(), -365)" :end="todayCN()" @change="row.occurDate = $event.detail.value; fe.clearField(`items[${i}].occurDate`)"><view class="picker-value">{{ row.occurDate || '请选择日期' }}<uni-icons type="calendar" size="18" color="#8f959e" /></view></picker></FormItem>
          <FormItem label="用途说明" required :error="fe.get(`items[${i}].purpose`)"><input v-model="row.purpose" class="input" maxlength="200" placeholder="说明费用用途" @input="fe.clearField(`items[${i}].purpose`)" /></FormItem>
          <FormItem label="金额" required :error="fe.get(`items[${i}].amountCents`)"><MoneyInput v-model="row.amountCents" @update:model-value="fe.clearField(`items[${i}].amountCents`)" /></FormItem>
          <view class="row between"><text>无票支出</text><view class="link-btn" :class="{ chosen: row.noInvoice }" @tap="toggleNoInvoice(row)">{{ row.noInvoice ? '已勾选 · 取消' : '勾选无票' }}</view></view>
          <FormItem v-if="row.noInvoice" label="无票原因" required :error="fe.get(`items[${i}].noInvoiceReason`)" help="至少 10 字"><textarea v-model="row.noInvoiceReason" class="textarea" maxlength="300" auto-height placeholder="说明无法提供票据的原因" @input="fe.clearField(`items[${i}].noInvoiceReason`)" /></FormItem>
          <FormItem v-else label="票据" required :error="fe.first(`items[${i}].invoices`)"><AttachmentPicker v-model="row.attachments" v-model:invoice-nos="row.invoiceNos" ref-type="EXPENSE_INVOICE" with-invoice-no :warnings="warnings" @busy="busyUploads[row.key] = $event" @update:model-value="fe.clearUnder(`items[${i}].invoices`)" @update:invoice-nos="fe.clearUnder(`items[${i}].invoices`)" /></FormItem>
        </view>
        <button class="btn btn-block" :disabled="form.items.length >= 50" @tap="form.items.push(emptyExpenseRow()); fe.clearUnder('items')">添加费用明细</button>
        <view class="field-help mt">全空明细不会保存。提交前会保存最新内容并预览审批路径。</view>
      </view>
    </template>
    <view class="bottom-bar expense-bar"><view class="bar-total"><text class="muted">报销合计（以服务端为准）</text><text class="amount">¥{{ formatCents(total) }}</text></view><view class="row"><button class="btn" :disabled="!ready || draft.busy || uploading" @tap="act(false)">保存草稿</button><button class="btn btn-primary" :disabled="!ready || draft.busy || uploading" @tap="act(true)">提交</button></view></view>
    <BottomSheet :visible="choosing" title="选择关联申请" @close="choosing = false">
      <view class="muted mb">可多选本人已通过的差旅与采购申请。</view>
      <view v-if="linkLoading" class="muted">加载中…</view>
      <view v-else-if="linkFailed" class="banner banner-danger">关联申请加载失败<view class="link-btn" @tap="loadLinks">重试</view></view>
      <view v-else-if="!linkOptions.length" class="muted">暂无可关联的申请，可选择独立报销。</view>
      <view v-for="a in linkOptions" :key="a.id" @tap="toggleLink(a.id)"><LinkedAppCard :app="a" :selected="form.relatedApplicationIds.includes(a.id)" /></view>
      <button class="btn btn-primary btn-block" @tap="choosing = false">完成选择（{{ form.relatedApplicationIds.length }}）</button>
    </BottomSheet>
  </view>
</template>

<style scoped>
.expense-page { padding-bottom: calc(240rpx + env(safe-area-inset-bottom)); }
.locked { pointer-events: none; opacity: .7; }
.modes { gap: 16rpx; margin: 12rpx 0; }
.chosen { background: #edf3ff; border: 2rpx solid #2f6bff; border-radius: 12rpx; }
.no-invoice { border-left: 6rpx solid #d97706; }
.expense-bar { display: block; }
.bar-total { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.expense-bar .row .btn { flex: 1; }
</style>
