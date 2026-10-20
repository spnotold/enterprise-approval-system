<script setup lang="ts">
// 差旅申请：选完起止时间后显示“N 天（自然日）/ 实际 H 小时”（上海时区，服务端会重新计算）
import { computed, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import type { AttachmentMeta, TravelSaveRequest } from '@/lib/types'
import { useDraftForm } from '@/composables/useDraftForm'
import { useAuthStore } from '@/stores/auth'
import { provideUploadTracker } from '@/lib/fileView'
import { rowKey, trimOrNull } from '@/lib/formModels'
import {
  WALL_FORMAT,
  diffDays,
  fmtTravelDuration,
  isoToShanghaiWall,
  shanghaiWallToIso,
  todayShanghai,
  travelDuration,
} from '@/lib/datetime'
import { TRANSPORT_LABEL, toOptions, type Transport } from '@/lib/labels'
import FormShell from './FormShell.vue'
import AmountInput from '@/components/AmountInput.vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import UserPicker from '@/components/UserPicker.vue'

const props = defineProps<{ id?: number }>()
const auth = useAuthStore()

interface CompanionDraft {
  key: number
  kind: 'USER' | 'NAME'
  userId: number | null
  name: string | null
  /** 已选系统用户的显示名 */
  userName: string | null
  deptName: string | null
}

interface TravelModel {
  title: string | null
  origin: string | null
  destination: string | null
  /** 上海墙上时间 YYYY-MM-DDTHH:mm:ss */
  startTime: string | null
  endTime: string | null
  transport: Transport | null
  purpose: string | null
  budgetCents: number | null
  companions: CompanionDraft[]
  attachments: AttachmentMeta[]
}

const LABELS: Record<string, string> = {
  title: '标题',
  origin: '出发地',
  destination: '目的地',
  startTime: '开始时间',
  endTime: '结束时间',
  transport: '交通方式',
  purpose: '出差事由',
  budgetCents: '预算',
  companions: '同行人员',
  userId: '系统用户',
  name: '姓名',
  attachmentIds: '附件',
}

const TRANSPORTS = toOptions(TRANSPORT_LABEL)
const len = (s: string | null | undefined) => [...(s ?? '').trim()].length
const isEmptyCompanion = (c: CompanionDraft) => (c.kind === 'USER' ? c.userId == null : !len(c.name))
let companionMap: number[] = []

function emptyModel(): TravelModel {
  return {
    title: null,
    origin: null,
    destination: null,
    startTime: null,
    endTime: null,
    transport: null,
    purpose: null,
    budgetCents: null,
    companions: [],
    attachments: [],
  }
}

function toBody(m: TravelModel): Omit<TravelSaveRequest, 'version'> {
  companionMap = []
  const companions: TravelSaveRequest['companions'] = []
  m.companions.forEach((c, i) => {
    if (isEmptyCompanion(c)) return
    companionMap.push(i)
    companions.push(c.kind === 'USER' ? { userId: c.userId, name: null } : { userId: null, name: trimOrNull(c.name) })
  })
  return {
    title: trimOrNull(m.title),
    origin: trimOrNull(m.origin),
    destination: trimOrNull(m.destination),
    startTime: shanghaiWallToIso(m.startTime),
    endTime: shanghaiWallToIso(m.endTime),
    transport: m.transport,
    purpose: trimOrNull(m.purpose),
    budgetCents: m.budgetCents,
    companions,
    attachmentIds: m.attachments.map((a) => a.id),
  }
}

function validate(m: TravelModel, full: boolean): Record<string, string> {
  const e: Record<string, string> = {}
  if (len(m.title) > 100) e.title = '标题不能超过 100 字'
  if (len(m.origin) > 100) e.origin = '出发地不能超过 100 字'
  if (len(m.destination) > 100) e.destination = '目的地不能超过 100 字'
  if (len(m.purpose) > 1000) e.purpose = '出差事由不能超过 1000 字'
  if (m.startTime && m.endTime && m.endTime < m.startTime) e.endTime = '结束时间不能早于开始时间'
  m.companions.forEach((c, i) => {
    if (c.kind === 'NAME' && len(c.name) > 50) e[`companions[${i}].name`] = '姓名不能超过 50 字'
  })
  if (!full) return e

  if (!len(m.title)) e.title = '请填写标题'
  if (!len(m.origin)) e.origin = '请填写出发地'
  if (!len(m.destination)) e.destination = '请填写目的地'
  if (!m.startTime) e.startTime = '请选择开始时间'
  if (!m.endTime) e.endTime = '请选择结束时间'
  if (m.startTime && m.endTime && m.endTime >= m.startTime && diffDays(m.startTime.slice(0, 10), m.endTime.slice(0, 10)) > 90) {
    e.endTime = '出差跨度不能超过 90 天'
  }
  if (!m.transport) e.transport = '请选择交通方式'
  if (!len(m.purpose)) e.purpose = '请填写出差事由'
  if (m.budgetCents == null) e.budgetCents = '请填写预算'
  const seen = new Map<number, number>()
  m.companions.forEach((c, i) => {
    if (c.kind !== 'USER' || c.userId == null) return
    if (c.userId === auth.me?.id) e[`companions[${i}].userId`] = '同行人员不能是本人'
    else if (seen.has(c.userId)) e[`companions[${i}].userId`] = `与第 ${seen.get(c.userId)! + 1} 位同行人员重复`
    else seen.set(c.userId, i)
  })
  return e
}

const draft = useDraftForm<TravelModel>({
  typePath: 'travel',
  initialId: props.id ?? null,
  idInQuery: props.id == null,
  emptyModel,
  fromDetail: (d) => {
    const t = d.travel
    if (!t) return emptyModel()
    return {
      title: d.title,
      origin: t.origin,
      destination: t.destination,
      startTime: isoToShanghaiWall(t.startTime),
      endTime: isoToShanghaiWall(t.endTime),
      transport: t.transport,
      purpose: t.purpose,
      budgetCents: t.budgetCents,
      companions: (t.companions ?? []).map((c) => ({
        key: rowKey(),
        kind: c.userId != null ? 'USER' : 'NAME',
        userId: c.userId,
        name: c.name,
        userName: c.userName,
        deptName: c.deptName,
      })),
      attachments: t.attachments ?? [],
    }
  },
  toBody,
  validateLight: (m) => validate(m, false),
  validateFull: (m) => validate(m, true),
  mapErrorPath: (path) => path.replace(/^companions\[(\d+)\]/, (_m, i: string) => `companions[${companionMap[Number(i)] ?? i}]`),
})

const { model, fe } = draft
const uploading = provideUploadTracker()
onMounted(() => void draft.load())

const err = (p: string) => fe.get(p)

const duration = computed(() => travelDuration(model.value.startTime, model.value.endTime))
const reversed = computed(
  () => !!model.value.startTime && !!model.value.endTime && model.value.endTime < model.value.startTime,
)
/** 开始时间早于当前（上海时间）：提交后显示“事后补报” */
const lateReport = computed(() => {
  const s = shanghaiWallToIso(model.value.startTime)
  return !!s && Date.parse(s) < Date.now()
})

function addCompanion() {
  model.value.companions.push({ key: rowKey(), kind: 'USER', userId: null, name: null, userName: null, deptName: null })
}
function removeCompanion(i: number) {
  model.value.companions.splice(i, 1)
}
function selfAndChosen(i: number): number[] {
  const ids = model.value.companions.filter((c, k) => k !== i && c.kind === 'USER' && c.userId != null).map((c) => c.userId!)
  return auth.me ? [auth.me.id, ...ids] : ids
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
/** 结束日期不早于开始日期 */
function endDisabled(d: Date) {
  if (!model.value.startTime) return false
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` < model.value.startTime.slice(0, 10)
}
const today = todayShanghai()
const START_DEFAULT = new Date(2000, 0, 1, 9, 0, 0)
const END_DEFAULT = new Date(2000, 0, 1, 18, 0, 0)
</script>

<template>
  <FormShell
    title="差旅申请"
    description="填写行程与出差预算"
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
    <el-form label-position="top" class="travel-form" @submit.prevent>
      <section class="form-section">
        <h3 class="section-title">行程信息</h3>
        <el-form-item label="标题" required :error="err('title')">
          <el-input v-model="model.title" maxlength="100" show-word-limit placeholder="如：赴北京参加技术交流会" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="出发地" required :error="err('origin')">
              <el-input v-model="model.origin" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="目的地" required :error="err('destination')">
              <el-input v-model="model.destination" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="开始时间" required :error="err('startTime')">
              <el-date-picker
                v-model="model.startTime"
                type="datetime"
                :value-format="WALL_FORMAT"
                format="YYYY-MM-DD HH:mm"
                :default-time="START_DEFAULT"
                placeholder="上海时间"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="结束时间" required :error="err('endTime')">
              <el-date-picker
                v-model="model.endTime"
                type="datetime"
                :value-format="WALL_FORMAT"
                format="YYYY-MM-DD HH:mm"
                :disabled-date="endDisabled"
                :default-time="END_DEFAULT"
                placeholder="上海时间"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="出差时长">
          <div class="duration">
            <template v-if="duration">
              <strong>{{ fmtTravelDuration(duration.naturalDays, duration.hours) }}</strong>
              <el-tag v-if="lateReport" type="warning" size="small" disable-transitions>事后补报</el-tag>
            </template>
            <span v-else-if="reversed" class="text-danger">结束时间不能早于开始时间</span>
            <span v-else class="muted">选择起止时间后自动计算</span>
          </div>
          <div v-if="lateReport" class="muted small">开始时间早于当前时间（今天 {{ today }}），将标记为事后补报。</div>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="交通方式" required :error="err('transport')">
              <el-select v-model="model.transport" placeholder="请选择" clearable>
                <el-option v-for="t in TRANSPORTS" :key="t.value" :value="t.value" :label="t.label" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="预算" required :error="err('budgetCents')">
              <AmountInput v-model:cents="model.budgetCents" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="出差事由" required :error="err('purpose')">
          <el-input v-model="model.purpose" type="textarea" :rows="3" maxlength="1000" show-word-limit />
        </el-form-item>
      </section>

      <section class="form-section">
        <h3 class="section-title">同行人员</h3>
        <div v-if="err('companions')" class="field-error field-error-msg">{{ err('companions') }}</div>
        <div v-if="model.companions.length === 0" class="muted small">无同行人员</div>
        <div v-for="(c, i) in model.companions" :key="c.key" class="companion">
          <el-radio-group v-model="c.kind" size="small">
            <el-radio-button value="USER">系统用户</el-radio-button>
            <el-radio-button value="NAME">外部人员</el-radio-button>
          </el-radio-group>
          <div class="companion-input" :class="{ 'cell-error': err(`companions[${i}].userId`) || err(`companions[${i}].name`) || err(`companions[${i}]`) }">
            <UserPicker
              v-if="c.kind === 'USER'"
              :model-value="c.userId"
              :preset="c.userId != null && c.userName ? [{ id: c.userId, realName: c.userName, deptName: c.deptName }] : []"
              :exclude="selfAndChosen(i)"
              placeholder="搜索同事姓名"
              @update:model-value="c.userId = typeof $event === 'number' ? $event : null"
            />
            <el-input v-else v-model="c.name" maxlength="50" placeholder="同行人姓名" />
            <div v-if="err(`companions[${i}].userId`) || err(`companions[${i}].name`) || err(`companions[${i}]`)" class="cell-error-msg">
              {{ err(`companions[${i}].userId`) ?? err(`companions[${i}].name`) ?? err(`companions[${i}]`) }}
            </div>
          </div>
          <el-button link type="danger" @click="removeCompanion(i)">删除</el-button>
        </div>
        <el-button size="small" :icon="Plus" style="margin-top: 8px" :disabled="model.companions.length >= 20" @click="addCompanion">
          添加同行人员
        </el-button>
      </section>

      <section class="form-section">
        <h3 class="section-title">附件</h3>
        <el-form-item label="附件" :error="err('attachmentIds')">
          <AttachmentUploader v-model="model.attachments" ref-type="TRAVEL_ATTACHMENT" :max-count="20" />
        </el-form-item>
      </section>
    </el-form>
  </FormShell>
</template>

<style scoped>
.travel-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.duration {
  display: flex;
  align-items: center;
  gap: 8px;
}
.companion {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.companion-input {
  flex: 1;
  min-width: min(220px, 100%);
  max-width: 420px;
}
.field-error {
  margin-bottom: 8px;
}
</style>
