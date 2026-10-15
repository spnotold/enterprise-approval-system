<script setup lang="ts">
// 流程设计器：字段库 | 表单画布 | 字段属性；节点列表 | 节点属性（含审批人规则与条件）
// 父组件以 v-model:form-schema / v-model:node-config 传入可编辑副本，本组件就地修改。
import { computed, nextTick, provide, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { AppType, FieldType, FormField, FormSchema, NodeConfig, NodeDef, ValidationIssue } from '@/lib/types'
import { APP_TYPE_LABEL } from '@/lib/labels'
import { confirmDialog } from '@/composables/useAction'
import FieldLibrary from './FieldLibrary.vue'
import FormCanvas from './FormCanvas.vue'
import FieldProps from './FieldProps.vue'
import NodeList from './NodeList.vue'
import NodeEditor from './NodeEditor.vue'
import {
  MAX_NODES,
  USER_NAMES_KEY,
  conditionVars,
  errCount,
  fieldProblems,
  issuesUnder,
  newField,
  newNode,
  nodeProblems,
  normalizeIssuePath,
  parseTarget,
  uidOf,
} from './utils'

const formSchema = defineModel<FormSchema>('formSchema', { required: true })
const nodeConfig = defineModel<NodeConfig>('nodeConfig', { required: true })

const props = withDefaults(
  defineProps<{
    readonly?: boolean
    /** 内置模板的业务类型：表单固定，只能调整节点；同时决定可用的系统变量 */
    builtin?: AppType | null
    /** 服务端校验问题（validate 结果或发布 42201 的 errors） */
    issues?: ValidationIssue[]
  }>(),
  { readonly: false, builtin: null, issues: () => [] },
)

const userNames = reactive<Record<number, string>>({})
provide(USER_NAMES_KEY, userNames)

const root = ref<HTMLElement | null>(null)
const formLocked = computed(() => props.readonly || !!props.builtin)
const tab = ref<'form' | 'flow'>(props.builtin ? 'flow' : 'form')
const selectedField = ref<number | null>(null)
const selectedNode = ref<number | null>(null)

const fields = computed<FormField[]>(() => formSchema.value.fields ?? [])
const nodes = computed<NodeDef[]>(() => nodeConfig.value.nodes ?? [])
const vars = computed(() => conditionVars(formSchema.value, props.builtin))

// 整体替换（重新加载、放弃草稿）时重置选中项
watch(
  () => formSchema.value,
  (s) => (selectedField.value = s.fields?.length ? 0 : null),
  { immediate: true },
)
watch(
  () => nodeConfig.value,
  (c) => (selectedNode.value = c.nodes?.length ? 0 : null),
  { immediate: true },
)

const currentField = computed(() => (selectedField.value == null ? null : (fields.value[selectedField.value] ?? null)))
const currentNode = computed(() => (selectedNode.value == null ? null : (nodes.value[selectedNode.value] ?? null)))

// ---------- 问题统计 ----------

const fieldIssueMaps = computed(() => fields.value.map((_, i) => issuesUnder(props.issues, 'field', i)))
const nodeIssueMaps = computed(() => nodes.value.map((_, i) => issuesUnder(props.issues, 'node', i)))
const fieldIssueCounts = computed(() => fieldIssueMaps.value.map(errCount))
const nodeIssueCounts = computed(() => nodeIssueMaps.value.map(errCount))
const fieldWarnCounts = computed(() =>
  formLocked.value ? [] : fields.value.map((f, i) => errCount(fieldProblems(f, i, fields.value))),
)
const nodeWarnCounts = computed(() =>
  props.readonly ? [] : nodes.value.map((n) => errCount(nodeProblems(n, vars.value))),
)

/** 不针对单个字段 / 节点的问题（如字段为空、节点数量），以及索引已不存在的问题 */
const formLevelIssues = computed(() =>
  props.issues.filter((i) => {
    const t = parseTarget(i.path)
    return t.kind === 'fields' || (t.kind === 'field' && t.index >= fields.value.length)
  }),
)
const flowLevelIssues = computed(() =>
  props.issues.filter((i) => {
    const t = parseTarget(i.path)
    return t.kind === 'nodes' || (t.kind === 'node' && t.index >= nodes.value.length)
  }),
)
const sum = (a: number[]) => a.reduce((s, n) => s + n, 0)
const formIssueCount = computed(() => sum(fieldIssueCounts.value) + formLevelIssues.value.length)
const flowIssueCount = computed(() => sum(nodeIssueCounts.value) + flowLevelIssues.value.length)

// ---------- 字段操作 ----------

function ensureFields(): FormField[] {
  if (!formSchema.value.fields) formSchema.value.fields = []
  return formSchema.value.fields
}

async function addField(type: FieldType) {
  if (formLocked.value) return
  const list = ensureFields()
  list.push(newField(type, list))
  selectedField.value = list.length - 1
  await scrollToPath(`fields[${list.length - 1}]`)
}

function moveItem<T>(list: T[], i: number, delta: -1 | 1, sel: { value: number | null }) {
  const j = i + delta
  if (j < 0 || j >= list.length) return
  const [it] = list.splice(i, 1)
  list.splice(j, 0, it)
  if (sel.value === i) sel.value = j
  else if (sel.value === j) sel.value = i
}

function moveField(i: number, delta: -1 | 1) {
  moveItem(ensureFields(), i, delta, selectedField)
}

function moveNode(i: number, delta: -1 | 1) {
  moveItem(ensureNodes(), i, delta, selectedNode)
}

function afterRemove(i: number, sel: { value: number | null }, len: number) {
  if (sel.value == null) return
  if (sel.value === i) sel.value = len === 0 ? null : Math.min(i, len - 1)
  else if (sel.value > i) sel.value--
}

function referencesOf(key: string): string[] {
  const out: string[] = []
  if (!key) return out
  for (const f of fields.value) if (f.key !== key && f.rules?.notBefore === key) out.push(`字段“${f.label || f.key}”的“不早于”`)
  for (const n of nodes.value) {
    if (n.condition?.rules?.some((r) => r.var === key)) out.push(`节点“${n.name || n.nodeKey}”的条件`)
  }
  return out
}

async function removeField(i: number) {
  const list = ensureFields()
  const f = list[i]
  if (!f) return
  const refs = referencesOf(f.key)
  const ok = await confirmDialog({
    title: '删除字段',
    message: `确定删除字段“${f.label || f.key}”吗？${refs.length ? `该字段被${refs.join('、')}引用，删除后需要另行调整。` : ''}`,
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  list.splice(i, 1)
  afterRemove(i, selectedField, list.length)
}

function setField(f: FormField) {
  if (selectedField.value != null) ensureFields()[selectedField.value] = f
}

function onStatAmount() {
  const cur = currentField.value
  for (const f of fields.value) if (f !== cur && f.statAmount) f.statAmount = undefined
}

function onRenameKey(oldKey: string, newKey: string) {
  let n = 0
  const cur = currentField.value
  for (const f of fields.value) {
    if (f !== cur && f.rules?.notBefore === oldKey) {
      f.rules.notBefore = newKey
      n++
    }
  }
  for (const node of nodes.value) {
    for (const r of node.condition?.rules ?? []) {
      if (r.var === oldKey) {
        r.var = newKey
        n++
      }
    }
  }
  if (n > 0) ElMessage.info(`已同步更新 ${n} 处对“${oldKey}”的引用`)
}

// ---------- 节点操作 ----------

function ensureNodes(): NodeDef[] {
  if (!nodeConfig.value.nodes) nodeConfig.value.nodes = []
  return nodeConfig.value.nodes
}

async function addNode() {
  if (props.readonly) return
  const list = ensureNodes()
  if (list.length >= MAX_NODES) {
    ElMessage.warning(`最多 ${MAX_NODES} 个节点`)
    return
  }
  list.push(newNode(list))
  selectedNode.value = list.length - 1
  await scrollToPath(`nodes[${list.length - 1}]`)
}

async function removeNode(i: number) {
  const list = ensureNodes()
  const n = list[i]
  if (!n) return
  const ok = await confirmDialog({
    title: '删除节点',
    message: `确定删除节点“${n.name || n.nodeKey}”吗？`,
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  list.splice(i, 1)
  afterRemove(i, selectedNode, list.length)
}

function setNode(n: NodeDef) {
  if (selectedNode.value != null) ensureNodes()[selectedNode.value] = n
}

// ---------- 定位 ----------

/** fields[2].rules.min -> [fields[2].rules.min, fields[2].rules, fields[2]] */
function pathPrefixes(p: string): string[] {
  const out = [p]
  let cur = p
  for (;;) {
    const next = cur.replace(/(\.[^.[\]]+|\[\d+\])$/, '')
    if (next === cur || !next) break
    out.push(next)
    cur = next
  }
  return out
}

function findEl(p: string): HTMLElement | null {
  const el = root.value?.querySelector(`[data-path="${CSS.escape(p)}"]`)
  return el instanceof HTMLElement ? el : null
}

function flash(el: HTMLElement) {
  el.classList.remove('tpl-locate-flash')
  void el.offsetWidth // 重新触发动画
  el.classList.add('tpl-locate-flash')
  window.setTimeout(() => el.classList.remove('tpl-locate-flash'), 1600)
}

async function scrollToPath(path: string, highlight = false) {
  await nextTick()
  await nextTick()
  const prefixes = pathPrefixes(path)
  const card = findEl(prefixes[prefixes.length - 1])
  const target = prefixes.slice(0, -1).map(findEl).find((el): el is HTMLElement => !!el) ?? null
  if (card) {
    card.scrollIntoView({ behavior: target ? 'auto' : 'smooth', block: 'nearest' })
    if (highlight) flash(card)
  }
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (highlight) flash(target)
    const input = target.querySelector('input, textarea')
    if (input instanceof HTMLElement && !input.hasAttribute('disabled')) input.focus({ preventScroll: true })
  }
}

/**
 * 按校验路径定位：fields[i]… 选中字段并打开属性面板；nodes[i]… 选中节点。
 * 返回 false 表示路径不对应设计器中的元素（如模板基本信息、整体问题）。
 */
async function locate(path: string | null | undefined): Promise<boolean> {
  const t = parseTarget(path)
  const norm = normalizeIssuePath(path) ?? ''
  switch (t.kind) {
    case 'field':
      tab.value = 'form'
      if (t.index >= fields.value.length) {
        ElMessage.warning('该字段已不存在，请重新校验')
        return true
      }
      selectedField.value = t.index
      await scrollToPath(norm, true)
      return true
    case 'node':
      tab.value = 'flow'
      if (t.index >= nodes.value.length) {
        ElMessage.warning('该节点已不存在，请重新校验')
        return true
      }
      selectedNode.value = t.index
      await scrollToPath(norm, true)
      return true
    case 'fields':
      tab.value = 'form'
      return true
    case 'nodes':
      tab.value = 'flow'
      return true
    default:
      return false
  }
}

defineExpose({ locate })
</script>

<template>
  <div ref="root" class="tpl-designer">
    <el-tabs v-model="tab">
      <el-tab-pane name="form">
        <template #label>
          <span class="tab-label">
            表单字段
            <el-badge v-if="formIssueCount" :value="formIssueCount" type="danger" class="tab-badge" />
          </span>
        </template>

        <el-alert
          v-if="builtin"
          type="info"
          show-icon
          :closable="false"
          class="mb"
          title="内置模板表单固定，只能调整审批节点"
          :description="`${APP_TYPE_LABEL[builtin]}的表单字段与校验规则由系统内置，不在此配置。`"
        />
        <el-alert
          v-for="(it, k) in formLevelIssues"
          :key="`f${k}`"
          type="error"
          show-icon
          :closable="false"
          class="mb"
          :title="it.message"
          :description="it.path ? `${it.code} · ${it.path}` : it.code"
        />

        <div class="cols" :class="{ 'no-lib': formLocked }">
          <aside v-if="!formLocked" class="col col-lib">
            <FieldLibrary @add="addField" />
          </aside>
          <section class="col col-main">
            <FormCanvas
              :fields="fields"
              :selected="selectedField"
              :readonly="formLocked"
              :issue-counts="fieldIssueCounts"
              :warn-counts="fieldWarnCounts"
              :empty-text="
                builtin ? '内置模板的表单由系统固定，不在此展示' : readonly ? '该版本没有字段' : '暂无字段，点击左侧字段库添加'
              "
              @select="(i) => (selectedField = i)"
              @move="moveField"
              @remove="removeField"
            />
          </section>
          <aside class="col col-side">
            <FieldProps
              v-if="currentField && selectedField !== null"
              :key="uidOf(currentField)"
              :field="currentField"
              :fields="fields"
              :index="selectedField"
              :readonly="formLocked"
              :issues="fieldIssueMaps[selectedField]"
              @update:field="setField"
              @stat-amount="onStatAmount"
              @rename-key="onRenameKey"
            />
            <el-empty v-else :image-size="64" description="选择画布中的字段以查看属性" />
          </aside>
        </div>
      </el-tab-pane>

      <el-tab-pane name="flow">
        <template #label>
          <span class="tab-label">
            审批节点
            <el-badge v-if="flowIssueCount" :value="flowIssueCount" type="danger" class="tab-badge" />
          </span>
        </template>

        <el-alert
          v-for="(it, k) in flowLevelIssues"
          :key="`n${k}`"
          type="error"
          show-icon
          :closable="false"
          class="mb"
          :title="it.message"
          :description="it.path ? `${it.code} · ${it.path}` : it.code"
        />

        <div class="cols flow">
          <section class="col col-main">
            <NodeList
              :nodes="nodes"
              :selected="selectedNode"
              :vars="vars"
              :readonly="readonly"
              :issue-counts="nodeIssueCounts"
              :warn-counts="nodeWarnCounts"
              @select="(i) => (selectedNode = i)"
              @move="moveNode"
              @remove="removeNode"
              @add="addNode"
            />
          </section>
          <aside class="col col-side">
            <NodeEditor
              v-if="currentNode && selectedNode !== null"
              :key="uidOf(currentNode)"
              :node="currentNode"
              :index="selectedNode"
              :vars="vars"
              :readonly="readonly"
              :issues="nodeIssueMaps[selectedNode]"
              @update:node="setNode"
            />
            <el-empty v-else :image-size="64" description="选择左侧节点以查看属性" />
          </aside>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.tpl-designer {
  min-width: 0;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tab-badge :deep(.el-badge__content) {
  position: static;
  transform: none;
}
.mb {
  margin-bottom: 12px;
}
.cols {
  display: grid;
  gap: 16px;
  align-items: start;
  grid-template-columns: 168px minmax(0, 1fr) minmax(340px, 400px);
}
.cols.no-lib {
  grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
}
.cols.flow {
  grid-template-columns: minmax(0, 1fr) minmax(420px, 540px);
}
.col {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.col-main {
  background: var(--el-fill-color-lighter);
}
.col-side {
  position: sticky;
  top: 8px;
  max-height: calc(100vh - 96px);
  overflow: auto;
}
@media (max-width: 1199px) {
  .cols,
  .cols.no-lib,
  .cols.flow {
    grid-template-columns: minmax(0, 1fr);
  }
  .col-side {
    position: static;
    max-height: none;
    overflow: visible;
  }
}
</style>

<style>
/* 定位校验问题时的闪烁高亮（作用于子组件元素，不加 scoped） */
@keyframes tpl-locate-flash {
  0%,
  60% {
    box-shadow: 0 0 0 3px var(--el-color-danger-light-5);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}
.tpl-locate-flash {
  border-radius: 6px;
  animation: tpl-locate-flash 1.6s ease-out;
}
</style>
