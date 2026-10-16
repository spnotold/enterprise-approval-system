<script setup lang="ts">
// 字段属性面板：基本属性与按类型的校验规则（FormField / FieldRules）
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, Delete, Plus } from '@element-plus/icons-vue'
import type { FieldRules, FormField } from '@/lib/types'
import { FIELD_TYPE_LABEL } from '@/lib/labels'
import { resolveDateToken } from '@/lib/datetime'
import { PATTERN_PRESETS } from '@/lib/formSchema'
import AmountInput from '@/components/AmountInput.vue'
import {
  ATTACHMENT_TYPES,
  FIELD_KEY_RE,
  MAX_OPTIONS,
  MIN_OPTIONS,
  TEXT_MAX,
  errAt,
  fieldKeyProblem,
  fieldProblems,
  mergeErr,
  nextOptionValue,
  type ErrMap,
} from './utils'

const field = defineModel<FormField>('field', { required: true })

const props = withDefaults(
  defineProps<{
    /** 全部字段（只读，用于唯一性检查与“不早于”候选） */
    fields: FormField[]
    index: number
    readonly?: boolean
    /** 服务端校验问题，键为相对本字段的路径 */
    issues?: ErrMap
  }>(),
  { readonly: false, issues: () => ({}) },
)

const emit = defineEmits<{
  /** 勾选“统计金额”，由上层取消其他字段的勾选 */
  statAmount: []
  renameKey: [oldKey: string, newKey: string]
}>()

const errors = computed(() => mergeErr(props.issues, fieldProblems(field.value, props.index, props.fields)))
const e = (sub: string) => errAt(errors.value, sub)
const p = (sub: string) => `fields[${props.index}].${sub}`

const serverList = computed(() =>
  Object.entries(props.issues).flatMap(([path, list]) => list.map((message) => ({ path, message }))),
)

// ---------- 规则读写：空值删除对应键，保持 JSON 干净 ----------

function setRule<K extends keyof FieldRules>(k: K, v: FieldRules[K] | null | undefined | '') {
  const f = field.value
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
    if (f.rules) {
      delete f.rules[k]
      if (Object.keys(f.rules).length === 0) delete f.rules
    }
    return
  }
  if (!f.rules) f.rules = {}
  f.rules[k] = v as FieldRules[K]
}

type NumKey = 'minLength' | 'maxLength' | 'precision' | 'maxCount' | 'maxSizeMb'
type StrKey = 'pattern' | 'patternMessage' | 'min' | 'max' | 'step' | 'earliest' | 'latest' | 'notBefore'

function numRule(k: NumKey) {
  return computed<number | undefined>({
    get: () => field.value.rules?.[k] ?? undefined,
    set: (v) => setRule(k, v ?? null),
  })
}
function strRule(k: StrKey) {
  return computed<string>({
    get: () => field.value.rules?.[k] ?? '',
    set: (v) => setRule(k, v ?? null),
  })
}

const minLength = numRule('minLength')
const maxLength = numRule('maxLength')
const precision = numRule('precision')
const maxCount = numRule('maxCount')
const maxSizeMb = numRule('maxSizeMb')
const pattern = strRule('pattern')
const patternMessage = strRule('patternMessage')
const min = strRule('min')
const max = strRule('max')
const step = strRule('step')
const earliest = strRule('earliest')
const latest = strRule('latest')
const notBefore = strRule('notBefore')

const minCents = computed<number | null>({
  get: () => field.value.rules?.minCents ?? null,
  set: (v) => setRule('minCents', v),
})
const maxCents = computed<number | null>({
  get: () => field.value.rules?.maxCents ?? null,
  set: (v) => setRule('maxCents', v),
})
const allowedTypes = computed<string[]>({
  get: () => field.value.rules?.allowedTypes ?? [],
  set: (v) => setRule('allowedTypes', v),
})

function setText(k: 'placeholder' | 'help', v: string) {
  field.value[k] = v === '' ? undefined : v
}

const textMax = computed(() => (field.value.type === 'TEXTAREA' ? TEXT_MAX.TEXTAREA : TEXT_MAX.TEXT))

// ---------- 字段标识：失焦时去空白，并通知上层同步引用 ----------

let keyAtFocus = field.value.key
function onKeyChange(v: string) {
  const next = (v ?? '').trim()
  if (next !== v) field.value.key = next
  const old = keyAtFocus
  if (old && next && old !== next && FIELD_KEY_RE.test(next) && !fieldKeyProblem(next, props.index, props.fields)) {
    emit('renameKey', old, next)
  }
  keyAtFocus = next
}

// ---------- 正则 ----------

type PatternMode = 'NONE' | 'MOBILE' | 'EMAIL' | 'CUSTOM'
const patternMode = ref<PatternMode>(
  field.value.rules?.patternPreset ?? (field.value.rules?.pattern ? 'CUSTOM' : 'NONE'),
)
function setPatternMode(m: PatternMode) {
  patternMode.value = m
  if (m === 'NONE') {
    setRule('patternPreset', null)
    setRule('pattern', null)
    setRule('patternMessage', null)
  } else if (m === 'CUSTOM') {
    setRule('patternPreset', null)
  } else {
    setRule('patternPreset', m)
    setRule('pattern', null)
  }
}
const patternMessagePlaceholder = computed(() =>
  patternMode.value === 'MOBILE' || patternMode.value === 'EMAIL'
    ? PATTERN_PRESETS[patternMode.value].message
    : `${field.value.label || '该字段'}格式不正确`,
)

// ---------- 日期 ----------

function normalizeToken(k: 'earliest' | 'latest') {
  const v = field.value.rules?.[k]
  if (v) setRule(k, v.trim().toUpperCase())
}
function resolvedHint(v: string): string {
  if (!v || !/^TODAY/i.test(v.trim())) return ''
  const d = resolveDateToken(v)
  return d ? `按今天计算为 ${d}` : ''
}
const otherDateFields = computed(() =>
  props.fields.filter((f, i) => i !== props.index && f.type === 'DATE' && f.key),
)

// ---------- 单选项 ----------

const options = computed(() => field.value.options ?? [])
function addOption() {
  if (!field.value.options) field.value.options = []
  const list = field.value.options
  if (list.length >= MAX_OPTIONS) return
  list.push({ value: nextOptionValue(list), label: `选项${list.length + 1}` })
}
function moveOption(k: number, delta: -1 | 1) {
  const list = field.value.options
  if (!list) return
  const j = k + delta
  if (j < 0 || j >= list.length) return
  const [o] = list.splice(k, 1)
  list.splice(j, 0, o)
}
function removeOption(k: number) {
  field.value.options?.splice(k, 1)
}

// ---------- 统计金额 ----------

function onStat(v: boolean | string | number) {
  if (v) {
    field.value.statAmount = true
    emit('statAmount')
  } else {
    field.value.statAmount = undefined
  }
}
</script>

<template>
  <el-form label-position="top" class="field-props" :disabled="readonly" @submit.prevent>
    <div class="panel-title">
      字段属性
      <el-tag size="small" effect="plain">{{ FIELD_TYPE_LABEL[field.type] ?? field.type }}</el-tag>
      <span class="muted small">第 {{ index + 1 }} 个字段</span>
    </div>

    <el-alert v-if="serverList.length" type="error" :closable="false" class="issue-alert">
      <template #title>本字段有 {{ serverList.length }} 个校验问题</template>
      <ul class="issue-ul">
        <li v-for="(it, k) in serverList" :key="k">
          {{ it.message }}<span v-if="it.path" class="mono muted small">（{{ it.path }}）</span>
        </li>
      </ul>
    </el-alert>

    <el-form-item label="字段名称" required :error="e('label')" :data-path="p('label')">
      <el-input v-model="field.label" maxlength="50" show-word-limit placeholder="如 请假类型" />
    </el-form-item>
    <el-form-item label="字段标识" required :error="e('key')" :data-path="p('key')">
      <el-input
        v-model="field.key"
        class="mono"
        maxlength="32"
        placeholder="如 leaveType"
        @focus="keyAtFocus = field.key"
        @change="onKeyChange"
      />
      <div class="muted small item-hint">
        以字母开头，只含字母、数字、下划线；不区分大小写唯一。修改后会同步更新“不早于”和节点条件中的引用。
      </div>
    </el-form-item>
    <el-form-item label="必填" :data-path="p('required')">
      <el-switch :model-value="!!field.required" @update:model-value="(v) => (field.required = !!v)" />
    </el-form-item>
    <el-form-item
      v-if="field.type !== 'RADIO' && field.type !== 'ATTACHMENT'"
      label="占位提示"
      :error="e('placeholder')"
      :data-path="p('placeholder')"
    >
      <el-input
        :model-value="field.placeholder ?? ''"
        maxlength="100"
        placeholder="输入框内的灰色提示，可不填"
        @update:model-value="(v: string) => setText('placeholder', v)"
      />
    </el-form-item>
    <el-form-item label="帮助说明" :error="e('help')" :data-path="p('help')">
      <el-input
        type="textarea"
        :rows="2"
        :model-value="field.help ?? ''"
        maxlength="200"
        show-word-limit
        placeholder="显示在字段下方的说明，可不填"
        @update:model-value="(v: string) => setText('help', v)"
      />
    </el-form-item>

    <el-divider content-position="left">校验规则</el-divider>

    <!-- 文本 -->
    <template v-if="field.type === 'TEXT' || field.type === 'TEXTAREA'">
      <div class="row2">
        <el-form-item label="最小长度" :error="e('rules.minLength')" :data-path="p('rules.minLength')">
          <el-input-number
            v-model="minLength"
            :min="0"
            :max="textMax"
            :step="1"
            step-strictly
            controls-position="right"
            placeholder="不限"
          />
        </el-form-item>
        <el-form-item label="最大长度" :error="e('rules.maxLength')" :data-path="p('rules.maxLength')">
          <el-input-number
            v-model="maxLength"
            :min="1"
            :max="textMax"
            :step="1"
            step-strictly
            controls-position="right"
            :placeholder="`默认 ${textMax}`"
          />
        </el-form-item>
      </div>
      <div class="muted small item-hint">长度按字符计，最大不超过 {{ textMax }}。</div>

      <template v-if="field.type === 'TEXT'">
        <el-form-item
          label="格式校验"
          :error="e('rules.patternPreset')"
          :data-path="p('rules.patternPreset')"
          class="mt"
        >
          <el-radio-group :model-value="patternMode" @update:model-value="(v) => setPatternMode(v as PatternMode)">
            <el-radio-button value="NONE">不限</el-radio-button>
            <el-radio-button value="MOBILE">手机号</el-radio-button>
            <el-radio-button value="EMAIL">邮箱</el-radio-button>
            <el-radio-button value="CUSTOM">自定义正则</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="patternMode === 'CUSTOM'"
          label="正则表达式"
          :error="e('rules.pattern')"
          :data-path="p('rules.pattern')"
        >
          <el-input v-model="pattern" class="mono" maxlength="200" placeholder="如 ^[A-Z]{2}\d{6}$" />
        </el-form-item>
        <el-form-item
          v-if="patternMode !== 'NONE'"
          label="格式错误提示"
          :error="e('rules.patternMessage')"
          :data-path="p('rules.patternMessage')"
        >
          <el-input v-model="patternMessage" maxlength="50" :placeholder="patternMessagePlaceholder" />
        </el-form-item>
      </template>
    </template>

    <!-- 数字 -->
    <template v-else-if="field.type === 'NUMBER'">
      <el-form-item label="小数位数" :error="e('rules.precision')" :data-path="p('rules.precision')">
        <el-input-number
          v-model="precision"
          :min="0"
          :max="4"
          :step="1"
          step-strictly
          controls-position="right"
          placeholder="4"
        />
        <div class="muted small item-hint">0 表示只能填整数，最多 4 位小数；不填默认 4 位。</div>
      </el-form-item>
      <div class="row2">
        <el-form-item label="最小值" :error="e('rules.min')" :data-path="p('rules.min')">
          <el-input v-model="min" class="mono" inputmode="decimal" placeholder="不限" maxlength="24" />
        </el-form-item>
        <el-form-item label="最大值" :error="e('rules.max')" :data-path="p('rules.max')">
          <el-input v-model="max" class="mono" inputmode="decimal" placeholder="不限" maxlength="24" />
        </el-form-item>
      </div>
      <el-form-item label="步长" :error="e('rules.step')" :data-path="p('rules.step')">
        <el-input v-model="step" class="mono" inputmode="decimal" placeholder="不限，如 0.5" maxlength="24" />
        <div class="muted small item-hint">填写后，取值须为“最小值（未设置时为 0）+ 步长的整数倍”。</div>
      </el-form-item>
    </template>

    <!-- 金额 -->
    <template v-else-if="field.type === 'AMOUNT'">
      <div class="row2">
        <el-form-item label="最小金额（元）" :error="e('rules.minCents')" :data-path="p('rules.minCents')">
          <AmountInput v-model:cents="minCents" placeholder="不限" clearable />
        </el-form-item>
        <el-form-item label="最大金额（元）" :error="e('rules.maxCents')" :data-path="p('rules.maxCents')">
          <AmountInput v-model:cents="maxCents" placeholder="不限" clearable />
        </el-form-item>
      </div>
      <el-form-item :error="e('statAmount')" :data-path="p('statAmount')">
        <el-checkbox :model-value="!!field.statAmount" @update:model-value="onStat">作为统计金额</el-checkbox>
        <div class="muted small item-hint">申请列表、统计报表使用该字段的金额；整张表单至多一个字段，勾选后会取消其他字段。</div>
      </el-form-item>
    </template>

    <!-- 日期 -->
    <template v-else-if="field.type === 'DATE'">
      <div class="row2">
        <el-form-item label="最早日期" :error="e('rules.earliest')" :data-path="p('rules.earliest')">
          <el-input v-model="earliest" class="mono" placeholder="不限，如 TODAY-7" @blur="normalizeToken('earliest')" />
          <div v-if="resolvedHint(earliest)" class="muted small item-hint">{{ resolvedHint(earliest) }}</div>
        </el-form-item>
        <el-form-item label="最晚日期" :error="e('rules.latest')" :data-path="p('rules.latest')">
          <el-input v-model="latest" class="mono" placeholder="不限，如 TODAY+30" @blur="normalizeToken('latest')" />
          <div v-if="resolvedHint(latest)" class="muted small item-hint">{{ resolvedHint(latest) }}</div>
        </el-form-item>
      </div>
      <div class="muted small item-hint">
        可填 YYYY-MM-DD，或 TODAY、TODAY+N、TODAY-N（N 为天数，按上海时区的当天计算）。
      </div>
      <el-form-item label="不早于" :error="e('rules.notBefore')" :data-path="p('rules.notBefore')" class="mt">
        <el-select v-model="notBefore" clearable placeholder="不限" style="width: 100%">
          <el-option
            v-for="f in otherDateFields"
            :key="f.key"
            :value="f.key"
            :label="`${f.label || f.key}（${f.key}）`"
          />
        </el-select>
        <div class="muted small item-hint">如“结束日期”不早于“开始日期”；只能选择本表单的其他日期字段。</div>
      </el-form-item>
    </template>

    <!-- 单选 -->
    <template v-else-if="field.type === 'RADIO'">
      <el-form-item label="选项" required :error="e('options')" :data-path="p('options')">
        <div class="opt-list">
          <div class="opt-row opt-head muted small">
            <span>显示名</span>
            <span>值</span>
            <span />
          </div>
          <div
            v-for="(o, k) in options"
            :key="k"
            class="opt-row"
            :class="{ 'cell-error': !!e(`options[${k}]`) }"
            :data-path="p(`options[${k}]`)"
          >
            <el-input v-model="o.label" maxlength="50" placeholder="如 年假" />
            <el-input v-model="o.value" class="mono" maxlength="50" placeholder="如 ANNUAL" />
            <span v-if="!readonly" class="opt-actions">
              <el-button link :icon="ArrowUp" :disabled="k === 0" title="上移" @click="moveOption(k, -1)" />
              <el-button
                link
                :icon="ArrowDown"
                :disabled="k === options.length - 1"
                title="下移"
                @click="moveOption(k, 1)"
              />
              <el-button link type="danger" :icon="Delete" title="删除" @click="removeOption(k)" />
            </span>
          </div>
          <div class="opt-foot">
            <el-button size="small" :icon="Plus" :disabled="options.length >= MAX_OPTIONS" @click="addOption">
              添加选项
            </el-button>
            <span class="muted small">
              {{ options.length }} / {{ MAX_OPTIONS }}（{{ MIN_OPTIONS }}–{{ MAX_OPTIONS }} 项，值不能重复；值用于保存与条件判断）
            </span>
          </div>
        </div>
      </el-form-item>
    </template>

    <!-- 附件 -->
    <template v-else-if="field.type === 'ATTACHMENT'">
      <div class="row2">
        <el-form-item label="最多文件数" :error="e('rules.maxCount')" :data-path="p('rules.maxCount')">
          <el-input-number
            v-model="maxCount"
            :min="1"
            :max="10"
            :step="1"
            step-strictly
            controls-position="right"
            placeholder="10"
          />
        </el-form-item>
        <el-form-item label="单个文件上限（MB）" :error="e('rules.maxSizeMb')" :data-path="p('rules.maxSizeMb')">
          <el-input-number
            v-model="maxSizeMb"
            :min="1"
            :max="10"
            :step="1"
            step-strictly
            controls-position="right"
            placeholder="10"
          />
        </el-form-item>
      </div>
      <el-form-item label="允许的类型" :error="e('rules.allowedTypes')" :data-path="p('rules.allowedTypes')">
        <el-checkbox-group v-model="allowedTypes">
          <el-checkbox v-for="t in ATTACHMENT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</el-checkbox>
        </el-checkbox-group>
        <div class="muted small item-hint">不勾选表示 JPEG、PNG、PDF 均可；单个文件不超过 10 MB。</div>
      </el-form-item>
    </template>
  </el-form>
</template>

<style scoped>
.field-props {
  display: flex;
  flex-direction: column;
}
.panel-title {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.issue-alert {
  margin-bottom: 12px;
}
.issue-ul {
  margin: 4px 0 0;
  padding-left: 18px;
  line-height: 1.6;
}
.item-hint {
  line-height: 1.5;
  margin-top: 4px;
  width: 100%;
}
.row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}
.row2 :deep(.el-input-number) {
  width: 100%;
}
.mt {
  margin-top: 12px;
}
.opt-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.opt-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
}
.opt-head {
  line-height: 1.2;
}
.opt-actions {
  display: inline-flex;
  white-space: nowrap;
}
.opt-actions .el-button + .el-button {
  margin-left: 2px;
}
.opt-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}
.mono :deep(input) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
