<script setup lang="ts">
// 节点属性：名称、审批方式、审批人规则、替代规则、超时时限、生效条件
import { computed } from 'vue'
import type { NodeDef, NodeMode } from '@/lib/types'
import { NODE_MODE_LABEL } from '@/lib/labels'
import ApproverRuleEditor from './ApproverRuleEditor.vue'
import ConditionEditor from './ConditionEditor.vue'
import { errAt, mergeErr, nodeProblems, subErr, type CondVar, type ErrMap } from './utils'

const node = defineModel<NodeDef>('node', { required: true })

const props = withDefaults(
  defineProps<{
    index: number
    vars: CondVar[]
    readonly?: boolean
    /** 服务端校验问题，键为相对本节点的路径 */
    issues?: ErrMap
  }>(),
  { readonly: false, issues: () => ({}) },
)

const MODES = Object.keys(NODE_MODE_LABEL) as NodeMode[]

const errors = computed(() => mergeErr(props.issues, nodeProblems(node.value, props.vars)))
const e = (sub: string) => errAt(errors.value, sub)
const p = (sub: string) => `nodes[${props.index}].${sub}`
const condErrors = computed(() => subErr(errors.value, 'condition'))

const serverList = computed(() =>
  Object.entries(props.issues).flatMap(([path, list]) => list.map((message) => ({ path, message }))),
)

const mode = computed<NodeMode>({
  get: () => node.value.mode ?? 'SINGLE',
  set: (v) => (node.value.mode = v),
})

function toggleFallback(on: boolean | string | number) {
  node.value.fallbackRule = on ? { type: 'ROLE', roleCode: 'ENTERPRISE_HEAD' } : undefined
}

const timeout = computed<number | undefined>({
  get: () => node.value.timeoutHours ?? undefined,
  set: (v) => (node.value.timeoutHours = v == null ? undefined : v),
})
</script>

<template>
  <el-form label-position="top" class="node-editor" :disabled="readonly" @submit.prevent>
    <div class="panel-title">
      节点属性
      <span class="muted small">第 {{ index + 1 }} 个节点 标识 {{ node.nodeKey }}</span>
    </div>

    <el-alert v-if="serverList.length" type="error" :closable="false" class="issue-alert">
      <template #title>本节点有 {{ serverList.length }} 个校验问题</template>
      <ul class="issue-ul">
        <li v-for="(it, k) in serverList" :key="k">
          {{ it.message }}<span v-if="it.path" class="muted small">（{{ it.path }}）</span>
        </li>
      </ul>
    </el-alert>

    <el-form-item label="节点名称" required :error="e('name')" :data-path="p('name')">
      <el-input v-model="node.name" maxlength="50" show-word-limit placeholder="如 部门负责人审批" />
    </el-form-item>

    <el-form-item label="审批方式" :error="e('mode')" :data-path="p('mode')">
      <el-radio-group v-model="mode">
        <el-radio v-for="m in MODES" :key="m" :value="m">{{ NODE_MODE_LABEL[m] }}</el-radio>
      </el-radio-group>
      <div class="muted small hint">
        会签：全部审批人同意才通过，任一驳回即驳回；或签：任一人处理即决定结果，其余待办自动取消。
      </div>
    </el-form-item>

    <el-form-item label="审批人规则" required :error="e('approverRule')" :data-path="p('approverRule')">
      <ApproverRuleEditor v-model:rule="node.approverRule" :mode="mode" :readonly="readonly" />
    </el-form-item>

    <el-form-item label="替代规则" :error="e('fallbackRule')" :data-path="p('fallbackRule')">
      <div class="fallback">
        <el-switch :model-value="!!node.fallbackRule" active-text="设置替代规则" @update:model-value="toggleFallback" />
        <div class="muted small hint">
          解析结果是申请人本人时使用替代规则（只取一人）；未设置时由企业负责人审批，仍是本人则使用系统兜底审批人。
        </div>
        <ApproverRuleEditor
          v-if="node.fallbackRule"
          v-model:rule="node.fallbackRule"
          mode="SINGLE"
          :readonly="readonly"
        />
      </div>
    </el-form-item>

    <el-form-item label="超时时限（小时）" :error="e('timeoutHours')" :data-path="p('timeoutHours')">
      <el-input-number
        v-model="timeout"
        :min="1"
        :max="8760"
        :step="1"
        step-strictly
        controls-position="right"
        placeholder="不限"
      />
      <div class="muted small hint">超过时限仍未处理时提醒审批人（每天至多一次）；留空表示不提醒。</div>
    </el-form-item>

    <el-form-item label="生效条件" :data-path="p('condition')">
      <ConditionEditor v-model:condition="node.condition" :vars="vars" :readonly="readonly" :errors="condErrors" />
    </el-form-item>
  </el-form>
</template>

<style scoped>
.node-editor {
  display: flex;
  flex-direction: column;
}
.panel-title {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
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
.hint {
  line-height: 1.5;
  margin-top: 4px;
  width: 100%;
}
.fallback {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
</style>
