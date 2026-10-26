<script setup lang="ts">
// 差旅申请：日期时间选择器（上海时区），实时显示“N 天（自然日）/ 实际 H 小时”，同行人员
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import type { AttachmentMeta, TravelSaveRequest, UserOption } from '@/lib/types'
import AttachmentPicker from '@/components/AttachmentPicker.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import FormItem from '@/components/FormItem.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import { useDraft } from '@/composables/useDraft'
import { applyApiError, scrollToError, useFieldErrors } from '@/composables/useFieldErrors'
import { auth, requireLogin } from '@/stores/auth'
import { hideLoading, loading, showError, toast } from '@/utils/feedback'
import { TRANSPORT_OPTIONS } from '@/utils/labels'
import { cnToIso, durationTenths, fmtTenths, isoToCn, naturalDays, parseTime } from '@/utils/time'
import { inputValue, pickerValue, type UniInputEvent, type UniPickerChangeEvent } from '@/utils/uniEvent'

type Transport = NonNullable<TravelSaveRequest['transport']>

interface CompanionRow {
  userId: number | null
  name: string
  display: string
}

const form = reactive({
  title: '',
  origin: '',
  destination: '',
  startDate: '',
  startTime: '09:00',
  endDate: '',
  endTime: '18:00',
  transport: null as Transport | null,
  purpose: '',
  budgetCents: null as number | null,
  companions: [] as CompanionRow[],
  attachments: [] as AttachmentMeta[],
})

const fe = useFieldErrors()
const { draft, trackDirty, startTracking, load, save, submit, finishSubmit } = useDraft('travel')
const ready = ref(false)
const uploading = ref(false)
// 聚焦中的输入框 key；小程序没有 :focus，用 @focus / @blur 切换 .is-focus
const foc = ref('')
const ic = (k: string, path = k) => ({ 'is-focus': foc.value === k, 'is-error': !!fe.get(path) })

const MAX_SPAN_MS = 90 * 24 * 3600 * 1000

const startIso = computed(() => (form.startDate ? cnToIso(form.startDate, form.startTime || '00:00') : null))
const endIso = computed(() => (form.endDate ? cnToIso(form.endDate, form.endTime || '00:00') : null))

const durationText = computed(() => {
  if (!startIso.value || !endIso.value) return ''
  const s = parseTime(startIso.value) as number
  const e = parseTime(endIso.value) as number
  if (e < s) return ''
  const days = naturalDays(startIso.value, endIso.value)
  const tenths = durationTenths(startIso.value, endIso.value)
  return `${days} 天（自然日）/ 实际 ${tenths === null ? '—' : fmtTenths(tenths)} 小时`
})

const timeError = computed(() => {
  if (!startIso.value || !endIso.value) return ''
  const s = parseTime(startIso.value) as number
  const e = parseTime(endIso.value) as number
  if (e < s) return '结束时间不能早于开始时间'
  if (e - s > MAX_SPAN_MS) return '出差跨度不能超过 90 天'
  return ''
})

const transportIndex = computed(() => TRANSPORT_OPTIONS.findIndex((o) => o.value === form.transport))

function body(): TravelSaveRequest {
  return {
    title: form.title.trim() || null,
    origin: form.origin.trim() || null,
    destination: form.destination.trim() || null,
    startTime: startIso.value,
    endTime: endIso.value,
    transport: form.transport,
    purpose: form.purpose.trim() || null,
    budgetCents: form.budgetCents,
    companions: form.companions.map((c) => (c.userId ? { userId: c.userId, name: null } : { userId: null, name: c.name.trim() })),
    attachmentIds: form.attachments.map((a) => a.id),
  }
}

/** 保存草稿时也要满足的成对约束：同行人员需为系统用户或填写姓名 */
function checkInvariants(): boolean {
  fe.clear()
  form.companions.forEach((c, i) => {
    if (!c.userId && !c.name.trim()) fe.set(`companions[${i}]`, '请选择系统用户或填写姓名')
  })
  if (timeError.value) fe.set('endTime', timeError.value)
  return fe.count.value === 0
}

function validateForSubmit(): boolean {
  checkInvariants()
  if (!form.origin.trim()) fe.set('origin', '请填写出发地')
  if (!form.destination.trim()) fe.set('destination', '请填写目的地')
  if (!form.startDate) fe.set('startTime', '请选择开始时间')
  if (!form.endDate) fe.set('endTime', '请选择结束时间')
  if (!form.transport) fe.set('transport', '请选择交通方式')
  if (!form.purpose.trim()) fe.set('purpose', '请填写出差事由')
  if (form.budgetCents === null) fe.set('budgetCents', '请填写预算')
  return fe.count.value === 0
}

const KNOWN = [/^title$/, /^origin$/, /^destination$/, /^startTime$/, /^endTime$/, /^transport$/, /^purpose$/, /^budgetCents$/, /^companions/, /^attachmentIds/]
const remap = (f: string) => (KNOWN.some((re) => re.test(f)) ? f : null)

async function reloadDraft(): Promise<void> {
  if (draft.id) await fill(draft.id)
}

async function onSave(): Promise<void> {
  if (uploading.value) return toast('附件上传中，请稍候')
  if (!checkInvariants()) return scrollToError()
  loading('保存中')
  try {
    await save(body())
  } catch (e) {
    applyApiError(fe, e, { remap, onRefresh: reloadDraft })
  } finally {
    hideLoading()
  }
}

async function onSubmit(): Promise<void> {
  if (uploading.value) return toast('附件上传中，请稍候')
  if (!validateForSubmit()) {
    toast('请完善标红的内容')
    return scrollToError()
  }
  try {
    const r = await submit(body())
    if (r) finishSubmit(r)
  } catch (e) {
    applyApiError(fe, e, { remap, onRefresh: reloadDraft })
  }
}

async function fill(id: number): Promise<void> {
  loading()
  try {
    const d = await load(id)
    const t = d?.travel
    if (!d || !t) return
    const s = isoToCn(t.startTime)
    const e = isoToCn(t.endTime)
    Object.assign(form, {
      title: d.title ?? '',
      origin: t.origin ?? '',
      destination: t.destination ?? '',
      startDate: s.date,
      startTime: s.time || '09:00',
      endDate: e.date,
      endTime: e.time || '18:00',
      transport: t.transport,
      purpose: t.purpose ?? '',
      budgetCents: t.budgetCents,
      companions: t.companions.map((c) => ({
        userId: c.userId,
        name: c.name ?? '',
        display: c.userId ? `${c.userName ?? '系统用户'}${c.deptName ? `（${c.deptName}）` : ''}` : (c.name ?? ''),
      })),
      attachments: [...t.attachments],
    })
    uni.setNavigationBarTitle({ title: `编辑差旅申请` })
  } catch (e) {
    showError(e)
  } finally {
    hideLoading()
  }
}

// ---------- 同行人员 ----------

const picker = reactive({ visible: false, keyword: '', results: [] as UserOption[], searching: false, name: '' })

function openCompanions(): void {
  picker.visible = true
  picker.keyword = ''
  picker.results = []
  picker.name = ''
}

async function search(): Promise<void> {
  const k = picker.keyword.trim()
  if (!k) return
  picker.searching = true
  try {
    picker.results = await api.dict.users(k)
  } catch (e) {
    showError(e)
  } finally {
    picker.searching = false
  }
}

function addUser(u: UserOption): void {
  if (u.id === auth.state.me?.id) return toast('不能添加自己为同行人员')
  if (form.companions.some((c) => c.userId === u.id)) return toast('已添加该同事')
  form.companions.push({ userId: u.id, name: '', display: `${u.realName}${u.deptName ? `（${u.deptName}）` : ''}` })
  fe.clearUnder('companions')
  toast(`已添加 ${u.realName}`)
}

function addName(): void {
  const n = picker.name.trim()
  if (!n) return toast('请填写姓名')
  if (n.length > 50) return toast('姓名不能超过 50 个字')
  form.companions.push({ userId: null, name: n, display: n })
  picker.name = ''
  fe.clearUnder('companions')
  toast(`已添加 ${n}`)
}

function removeCompanion(i: number): void {
  form.companions.splice(i, 1)
  fe.clearUnder('companions')
}

// ---------- 输入事件 ----------

function onField(key: 'title' | 'origin' | 'destination' | 'purpose', e: Event | UniInputEvent): void {
  form[key] = inputValue(e)
  fe.clearField(key)
}

function onPick(key: 'startDate' | 'startTime' | 'endDate' | 'endTime', e: Event | UniPickerChangeEvent): void {
  const value = String(pickerValue(e))
  form[key] = value
  // 选完开始日期且结束日期为空时，默认同一天
  if (key === 'startDate' && !form.endDate) form.endDate = value
  fe.clearField('startTime')
  fe.clearField('endTime')
}

function onTransport(e: Event | UniPickerChangeEvent): void {
  form.transport = TRANSPORT_OPTIONS[Number(pickerValue(e))].value
  fe.clearField('transport')
}

onLoad(async (q) => {
  if (!(await requireLogin())) return
  if (q?.id) await fill(Number(q.id))
  ready.value = true
  trackDirty(() => form)
  startTracking()
})
</script>

<template>
  <view class="page page--bar">
    <view v-if="draft.appNo" class="draft-no">草稿 {{ draft.appNo }}</view>
    <view v-if="fe.general.value.length" class="banner banner-danger">
      <view v-for="m in fe.general.value" :key="m">{{ m }}</view>
    </view>

    <view class="card">
      <view class="card-title"><view class="ink-glyph ink-glyph--hill" /><text class="flex1">行程信息</text></view>
      <FormItem label="标题" :error="fe.get('title')">
        <input
          class="input"
          :class="ic('title')"
          :value="form.title"
          placeholder="选填，如“北京客户拜访”"
          placeholder-class="placeholder"
          maxlength="100"
          @input="onField('title', $event)"
          @focus="foc = 'title'"
          @blur="foc = ''"
        />
      </FormItem>
      <view class="trip-block">
        <view class="row two">
          <FormItem class="flex1" label="出发地" required :error="fe.get('origin')">
            <input
              class="input"
              :class="ic('origin')"
              :value="form.origin"
              placeholder="如 杭州"
              placeholder-class="placeholder"
              maxlength="100"
              @input="onField('origin', $event)"
              @focus="foc = 'origin'"
              @blur="foc = ''"
            />
          </FormItem>
          <FormItem class="flex1" label="目的地" required :error="fe.get('destination')">
            <input
              class="input"
              :class="ic('destination')"
              :value="form.destination"
              placeholder="如 北京"
              placeholder-class="placeholder"
              maxlength="100"
              @input="onField('destination', $event)"
              @focus="foc = 'destination'"
              @blur="foc = ''"
            />
          </FormItem>
        </view>

        <FormItem label="开始时间" required :error="fe.get('startTime')">
          <view class="row two">
            <picker class="flex1" mode="date" :value="form.startDate" @change="onPick('startDate', $event)">
              <view class="picker-value" :class="{ 'is-error': !!fe.get('startTime') }" hover-class="is-pressed" :hover-stay-time="60">
                <text :class="{ placeholder: !form.startDate }">{{ form.startDate || '选择日期' }}</text>
                <uni-icons type="calendar" size="18" color="var(--eas-ink-3)" />
              </view>
            </picker>
            <picker class="time" mode="time" :value="form.startTime" @change="onPick('startTime', $event)">
              <view class="picker-value num" hover-class="is-pressed" :hover-stay-time="60">{{ form.startTime }}</view>
            </picker>
          </view>
        </FormItem>
        <FormItem label="结束时间" required :error="fe.get('endTime') || timeError">
          <view class="row two">
            <picker class="flex1" mode="date" :value="form.endDate" :start="form.startDate" @change="onPick('endDate', $event)">
              <view class="picker-value" :class="{ 'is-error': !!fe.get('endTime') || !!timeError }" hover-class="is-pressed" :hover-stay-time="60">
                <text :class="{ placeholder: !form.endDate }">{{ form.endDate || '选择日期' }}</text>
                <uni-icons type="calendar" size="18" color="var(--eas-ink-3)" />
              </view>
            </picker>
            <picker class="time" mode="time" :value="form.endTime" @change="onPick('endTime', $event)">
              <view class="picker-value num" :class="{ 'is-error': !!timeError }" hover-class="is-pressed" :hover-stay-time="60">{{ form.endTime }}</view>
            </picker>
          </view>
        </FormItem>
        <view v-if="durationText" class="banner banner-info duration">{{ durationText }}</view>
      </view>

      <FormItem label="交通方式" required :error="fe.get('transport')">
        <picker :range="TRANSPORT_OPTIONS" range-key="label" :value="Math.max(0, transportIndex)" @change="onTransport">
          <view class="picker-value" :class="{ 'is-error': !!fe.get('transport') }" hover-class="is-pressed" :hover-stay-time="60">
            <text :class="{ placeholder: transportIndex < 0 }">
              {{ transportIndex < 0 ? '请选择' : TRANSPORT_OPTIONS[transportIndex].label }}
            </text>
            <uni-icons type="right" size="16" color="var(--eas-ink-3)" />
          </view>
        </picker>
      </FormItem>
      <FormItem label="出差事由" required :error="fe.get('purpose')">
        <textarea
          class="textarea"
          :class="ic('purpose')"
          :value="form.purpose"
          placeholder="说明出差目的与安排"
          placeholder-class="placeholder"
          maxlength="500"
          :auto-height="true"
          :show-confirm-bar="false"
          @input="onField('purpose', $event)"
          @focus="foc = 'purpose'"
          @blur="foc = ''"
        />
      </FormItem>
      <FormItem label="预算" required :error="fe.get('budgetCents')">
        <MoneyInput v-model="form.budgetCents" :error="!!fe.get('budgetCents')" @update:model-value="fe.clearField('budgetCents')" />
      </FormItem>
    </view>

    <view class="card">
      <view class="card-title">
        <text class="flex1">同行人员</text>
        <button class="btn companion-add" hover-class="is-pressed" :hover-stay-time="60" @tap="openCompanions">添加</button>
      </view>
      <view v-if="!form.companions.length" class="empty-line">无同行人员</view>
      <view v-for="(c, i) in form.companions" :key="i" class="companion">
        <view class="flex1">
          <text class="bold companion-name">{{ c.display || c.name }}</text>
          <text class="comp-kind">{{ c.userId ? '系统用户' : '非系统用户' }}</text>
          <view v-if="fe.first(`companions[${i}]`)" class="field-err">{{ fe.first(`companions[${i}]`) }}</view>
        </view>
        <view class="link-btn danger" hover-class="is-pressed" :hover-stay-time="60" @tap="removeCompanion(i)">移除</view>
      </view>
      <view v-if="fe.get('companions')" class="field-err">{{ fe.get('companions') }}</view>
    </view>

    <view class="card">
      <view class="card-title">附件（选填）</view>
      <AttachmentPicker
        v-model="form.attachments"
        ref-type="TRAVEL_ATTACHMENT"
        :error="fe.first('attachmentIds')"
        @busy="uploading = $event"
      />
    </view>

    <view class="bottom-bar">
      <button class="btn" :disabled="draft.busy || !ready" hover-class="is-pressed" :hover-stay-time="60" @tap="onSave">保存草稿</button>
      <button class="btn btn-primary" :disabled="draft.busy || !ready" hover-class="press-primary" :hover-stay-time="60" @tap="onSubmit">提交</button>
    </view>

    <BottomSheet :visible="picker.visible" title="添加同行人员" @close="picker.visible = false">
      <view class="field-label">搜索系统用户</view>
      <view class="row">
        <input
          v-model="picker.keyword"
          class="input flex1"
          :class="{ 'is-focus': foc === 'keyword' }"
          placeholder="姓名或用户名"
          placeholder-class="placeholder"
          confirm-type="search"
          @confirm="search"
          @focus="foc = 'keyword'"
          @blur="foc = ''"
        />
        <button class="btn search-btn" :loading="picker.searching" hover-class="is-pressed" :hover-stay-time="60" @tap="search">搜索</button>
      </view>
      <view v-for="u in picker.results" :key="u.id" class="user-row" hover-class="is-pressed" :hover-stay-time="60" @tap="addUser(u)">
        <view class="flex1">
          <text class="bold">{{ u.realName }}</text>
          <text class="muted user-meta">{{ u.username }}</text>
          <text v-if="u.deptName" class="muted user-meta">{{ u.deptName }}</text>
        </view>
        <text class="link-btn">添加</text>
      </view>
      <view v-if="picker.keyword && !picker.results.length && !picker.searching" class="muted mt">输入后点“搜索”</view>
      <view class="divider" />
      <view class="field-label">非系统人员（如外部人员）</view>
      <view class="row">
        <input
          v-model="picker.name"
          class="input flex1"
          :class="{ 'is-focus': foc === 'name' }"
          placeholder="填写姓名"
          placeholder-class="placeholder"
          maxlength="50"
          @focus="foc = 'name'"
          @blur="foc = ''"
        />
        <button class="btn search-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="addName">添加</button>
      </view>
    </BottomSheet>
  </view>
</template>

<style scoped>
@import '../../styles/form.css';

.draft-no {
  margin: 0 8rpx 16rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}

.two > .flex1 + .flex1,
.two > .time {
  margin-left: 16rpx;
}

.time {
  width: 164rpx;
  flex-shrink: 0;
}

.num {
  font-variant-numeric: tabular-nums;
}

.duration {
  margin: 4rpx 0 8rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.trip-block {
  padding: 0 20rpx 16rpx;
  margin: 12rpx 0;
  background: var(--eas-row-hover);
  border-radius: var(--eas-radius-control);
}

.trip-block .picker-value {
  padding: 0 16rpx;
  font-size: var(--eas-fs-sm);
}

.companion-add {
  margin: 12rpx 8rpx 16rpx 20rpx;
}

.empty-line {
  min-height: 88rpx;
  display: flex;
  align-items: center;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-3);
}

.companion {
  display: flex;
  align-items: center;
  min-height: 88rpx;
  padding: 12rpx 16rpx 12rpx 24rpx;
  margin: 20rpx 0;
  background: var(--eas-row-hover);
  border-radius: var(--eas-radius-control);
}

.comp-kind {
  display: block;
  margin-top: 4rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.search-btn {
  margin-left: 16rpx;
  margin-right: 8rpx;
  width: 160rpx;
  flex-shrink: 0;
}

.user-row {
  display: flex;
  align-items: center;
  min-height: 96rpx;
  margin: 20rpx 0;
  padding: 12rpx 16rpx 12rpx 24rpx;
  background: var(--eas-row-hover);
  border-radius: var(--eas-radius-control);
}

.user-row.is-pressed {
  background-color: var(--eas-tab) !important;
}

.user-meta {
  display: block;
}

.companion-name,
.user-row .flex1 {
  overflow-wrap: anywhere;
}
</style>
