<script setup lang="ts">
// 节点生效条件：变量 + 运算符 + 值，多条规则按 AND / OR 组合
import { computed } from 'vue'
import { Close, Delete, Plus } from '@element-plus/icons-vue'
import type { Condition, ConditionOp, ConditionRule } from '@/lib/types'
import { CONDITION_OP_LABEL } from '@/lib/labels'
import ConditionValue from './ConditionValue.vue'
import { OP_SYMBOL, conditionText, errAt, opsFor, type CondVar, type ErrMap } from './utils'

const condition = defineModel<Condition | null | undefined>('condition')

const props = withDefaults(
  defineProps<{
    vars: CondVar[]
    readonly?: boolean
    /** 键为相对 condition 的路径，如 rules[0].value */
    errors?: ErrMap
  }>(),
  { readonly: false, errors: () => ({}) },
)

const MAX_RULES = 10

const formVars = computed(() => props.vars.filter((v) => !v.system))
const sysVars = computed(() => props.vars.filter((v) => v.system))

function varOf(r: ConditionRule): CondVar | undefined {
  return props.vars.find((v) => v.key === r.var)
}

function newRule(): ConditionRule {
  const v = props.vars[0]
  if (!v) return { var: '', op: 'EQ', value: null }
  return { var: v.key, op: v.kind === 'RADIO' ? 'EQ' : 'GTE', value: null }
}

function toggle(on: boolean | string | number) {
  condition.value = on ? { logic: 'AND', rules: [newRule()] } : undefined
}

function addRule() {
  if (!condition.value) return
  if (condition.value.rules.length >= MAX_RULES) return
  condition.value.rules.push(newRule())
}

function removeRule(k: number) {
  condition.value?.rules.splice(k, 1)
}

function onVarChange(r: ConditionRule) {
  const cv = varOf(r)
  if (!opsFor(cv?.kind).includes(r.op)) r.op = 'EQ'
  if (r.op === 'IN') {
    r.values = []
    delete r.value
  } else {
    r.value = null
    delete r.values
  }
}

function onOpChange(r: ConditionRule) {
  if (r.op === 'IN') {
    if (!r.values) r.values = r.value ? [r.value] : []
    delete r.value
  } else {
    if (r.value === undefined) r.value = r.values?.[0] || null
    delete r.values
  }
}

function inValues(r: ConditionRule): string[] {
  return r.values ?? []
}
function setInValue(r: ConditionRule, j: number, v: string | null | undefined) {
  if (!r.values) r.values = []
  r.values[j] = v ?? ''
}
function addInValue(r: ConditionRule) {
  if (!r.values) r.values = []
  r.values.push('')
}
function removeInValue(r: ConditionRule, j: number) {
  r.values?.splice(j, 1)
}

function opLabel(op: ConditionOp) {
  return `${OP_SYMBOL[op]}  ${CONDITION_OP_LABEL[op]}`
}

const generalErr = computed(() =>
  [...(props.errors[''] ?? []), ...(props.errors.logic ?? []), ...(props.errors.rules ?? [])].join('；'),
)
const text = computed(() => conditionText(condition.value, props.vars))
</script>

<template>
  <div class="cond-editor">
    <div class="cond-switch">
      <el-switch
        :model-value="!!condition"
        :disabled="readonly || (!condition && vars.length === 0)"
        active-text="仅在满足条件时审批"
        @update:model-value="toggle"
      />
    </div>
    <div v-if="!condition" class="muted small">
      {{
        vars.length === 0
          ? '表单中没有可用于条件的字段（数字、金额、日期、单选），该节点始终审批。'
          : '未设置条件：该节点始终审批。条件不满足的节点在审批时自动跳过。'
      }}
    </div>

    <template v-else>
      <div class="cond-logic">
        <span class="muted small">满足</span>
        <el-radio-group v-model="condition.logic" size="small" :disabled="readonly">
          <el-radio-button value="AND">全部条件（且）</el-radio-button>
          <el-radio-button value="OR">任一条件（或）</el-radio-button>
        </el-radio-group>
        <span class="muted small">时审批，否则跳过</span>
      </div>

      <div
        v-for="(r, k) in condition.rules"
        :key="k"
        class="cond-rule"
        :class="{ 'cell-error': !!errAt(errors, `rules[${k}]`) }"
      >
        <div class="cond-row">
          <el-select
            v-model="r.var"
            placeholder="选择变量"
            filterable
            :disabled="readonly"
            class="c-var"
            @change="onVarChange(r)"
          >
            <el-option-group v-if="sysVars.length" label="系统变量">
              <el-option v-for="v in sysVars" :key="v.key" :value="v.key" :label="v.label" />
            </el-option-group>
            <el-option-group v-if="formVars.length" label="表单字段">
              <el-option v-for="v in formVars" :key="v.key" :value="v.key" :label="v.label">
                <span>{{ v.label }}</span>
                <span class="muted small mono" style="margin-left: 8px">{{ v.key }}</span>
              </el-option>
            </el-option-group>
            <el-option v-if="r.var && !varOf(r)" :value="r.var" :label="`${r.var}（不存在）`" disabled />
          </el-select>
          <el-select v-model="r.op" :disabled="readonly" class="c-op" @change="onOpChange(r)">
            <el-option v-for="op in opsFor(varOf(r)?.kind)" :key="op" :value="op" :label="opLabel(op)" />
          </el-select>
          <div class="c-val">
            <template v-if="r.op === 'IN'">
              <el-select
                v-if="varOf(r)?.kind === 'RADIO'"
                :model-value="inValues(r)"
                multiple
                placeholder="选择一个或多个选项"
                :disabled="readonly"
                style="width: 100%"
                @update:model-value="(v: string[]) => (r.values = v)"
              >
                <el-option
                  v-for="o in varOf(r)?.options ?? []"
                  :key="o.value"
                  :value="o.value"
                  :label="o.label || o.value"
                />
              </el-select>
              <div v-else class="in-list">
                <div v-for="(val, j) in inValues(r)" :key="j" class="in-item">
                  <ConditionValue
                    :model-value="val"
                    :kind="varOf(r)?.kind"
                    :readonly="readonly"
                    @update:model-value="(v) => setInValue(r, j, v)"
                  />
                  <el-button v-if="!readonly" link :icon="Close" title="移除" @click="removeInValue(r, j)" />
                </div>
                <el-button v-if="!readonly" link type="primary" :icon="Plus" size="small" @click="addInValue(r)">
                  添加值
                </el-button>
              </div>
            </template>
            <ConditionValue
              v-else
              v-model="r.value"
              :kind="varOf(r)?.kind"
              :options="varOf(r)?.options ?? []"
              :readonly="readonly"
            />
          </div>
          <el-button
            v-if="!readonly"
            link
            type="danger"
            :icon="Delete"
            title="删除条件"
            class="c-del"
            @click="removeRule(k)"
          />
        </div>
        <div v-if="errAt(errors, `rules[${k}]`)" class="field-error-msg">{{ errAt(errors, `rules[${k}]`) }}</div>
      </div>

      <div class="cond-foot">
        <el-button
          v-if="!readonly"
          size="small"
          :icon="Plus"
          :disabled="condition.rules.length >= MAX_RULES || vars.length === 0"
          @click="addRule"
        >
          添加条件
        </el-button>
        <span v-if="text" class="cond-text">条件：{{ text }}</span>
      </div>
      <div v-if="generalErr" class="field-error-msg">{{ generalErr }}</div>
    </template>
  </div>
</template>

<style scoped>
.cond-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.cond-logic {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.cond-rule {
  padding: 8px;
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
  background: var(--eas-desk);
}
.cond-rule.cell-error {
  border-color: var(--eas-danger);
}
.cond-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 130px minmax(140px, 1.3fr) auto;
  gap: 6px;
  align-items: start;
}
.in-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.in-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.c-del {
  margin-top: 6px;
}
.cond-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.cond-text {
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
  word-break: break-all;
}
@media (max-width: 640px) {
  .cond-row {
    grid-template-columns: 1fr 1fr;
  }
  .c-val {
    grid-column: 1 / -1;
  }
}
</style>
