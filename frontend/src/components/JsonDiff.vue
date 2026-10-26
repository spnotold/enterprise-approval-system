<script setup lang="ts">
// JSON 前后值对比（审计日志）：两侧展开为点路径逐项比较，新增绿、删除红、修改黄；
// 另附格式化后的原始 JSON。所有值一律按文本插值显示，不使用 v-html。
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    before: unknown
    after: unknown
    beforeLabel?: string
    afterLabel?: string
  }>(),
  { beforeLabel: '修改前', afterLabel: '修改后' },
)

type DiffKind = 'added' | 'removed' | 'changed' | 'same'

interface DiffRow {
  path: string
  kind: DiffKind
  before: string
  after: string
}

const ROOT = '(根)'
const KIND_LABEL: Record<DiffKind, string> = { added: '新增', removed: '删除', changed: '修改', same: '未变' }

const showSame = ref(false)

/** JSONB 偶尔以字符串形式返回：能解析为对象 / 数组时按结构比较 */
function normalize(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const s = v.trim()
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s) as unknown
    } catch {
      return v
    }
  }
  return v
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function keySegment(prefix: string, key: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return prefix ? `${prefix}.${key}` : key
  return `${prefix}[${JSON.stringify(key)}]`
}

function flatten(v: unknown, prefix: string, out: Map<string, unknown>) {
  if (Array.isArray(v)) {
    if (v.length === 0) out.set(prefix || ROOT, v)
    else v.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out))
    return
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v)
    if (keys.length === 0) out.set(prefix || ROOT, v)
    else for (const k of keys) flatten(v[k], keySegment(prefix, k), out)
    return
  }
  out.set(prefix || ROOT, v)
}

/** null / undefined 视为“无数据”（如新建时没有修改前的值） */
function toMap(v: unknown): Map<string, unknown> {
  const m = new Map<string, unknown>()
  if (v !== null && v !== undefined) flatten(v, '', m)
  return m
}

function show(v: unknown): string {
  if (v === undefined) return ''
  const s = JSON.stringify(v)
  return s === undefined ? String(v) : s
}

function pretty(v: unknown): string {
  if (v === null || v === undefined) return '（无）'
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2) ?? String(v)
}

/** 按修改后的字段顺序排列，被删除的字段插回它在修改前的位置附近，使同一对象 / 数组的路径相邻 */
function mergeOrder(b: Map<string, unknown>, a: Map<string, unknown>): string[] {
  const bKeys = [...b.keys()]
  const bIndex = new Map(bKeys.map((k, i) => [k, i]))
  const out: string[] = []
  let i = 0
  const flushRemovedUntil = (stop: number) => {
    for (; i < stop; i++) if (!a.has(bKeys[i])) out.push(bKeys[i])
  }
  for (const k of a.keys()) {
    const idx = bIndex.get(k)
    if (idx !== undefined && idx >= i) {
      flushRemovedUntil(idx)
      i = idx + 1
    }
    out.push(k)
  }
  flushRemovedUntil(bKeys.length)
  return out
}

const beforeValue = computed(() => normalize(props.before))
const afterValue = computed(() => normalize(props.after))

const rows = computed<DiffRow[]>(() => {
  const b = toMap(beforeValue.value)
  const a = toMap(afterValue.value)
  return mergeOrder(b, a).map((path) => {
    const inB = b.has(path)
    const inA = a.has(path)
    const before = show(b.get(path))
    const after = show(a.get(path))
    const kind: DiffKind = !inB ? 'added' : !inA ? 'removed' : before === after ? 'same' : 'changed'
    return { path, kind, before, after }
  })
})

const counts = computed(() => {
  const c: Record<DiffKind, number> = { added: 0, removed: 0, changed: 0, same: 0 }
  for (const r of rows.value) c[r.kind]++
  return c
})

const visibleRows = computed(() => (showSame.value ? rows.value : rows.value.filter((r) => r.kind !== 'same')))

const emptyText = computed(() => {
  if (rows.value.length === 0) return '前后均无数据'
  return '前后值没有差异，可打开“显示未变化字段”查看全部字段'
})

const rawBefore = computed(() => pretty(beforeValue.value))
const rawAfter = computed(() => pretty(afterValue.value))
</script>

<template>
  <div class="json-diff">
    <div class="jd-toolbar">
      <div class="jd-legend">
        <span class="jd-chip jd-added">新增 {{ counts.added }}</span>
        <span class="jd-chip jd-removed">删除 {{ counts.removed }}</span>
        <span class="jd-chip jd-changed">修改 {{ counts.changed }}</span>
        <span class="jd-chip">未变 {{ counts.same }}</span>
      </div>
      <el-switch v-model="showSame" active-text="显示未变化字段" />
    </div>

    <div class="jd-table-wrap">
      <table class="jd-table">
        <thead>
          <tr>
            <th class="jd-col-path">字段</th>
            <th class="jd-col-kind">变化</th>
            <th>{{ beforeLabel }}</th>
            <th>{{ afterLabel }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in visibleRows" :key="r.path" :class="`jd-${r.kind}`">
            <td class="mono jd-path">{{ r.path }}</td>
            <td class="jd-kind">{{ KIND_LABEL[r.kind] }}</td>
            <td class="mono pre-wrap">
              <span v-if="r.kind === 'added'" class="muted">—</span>
              <template v-else>{{ r.before }}</template>
            </td>
            <td class="mono pre-wrap">
              <span v-if="r.kind === 'removed'" class="muted">—</span>
              <template v-else>{{ r.after }}</template>
            </td>
          </tr>
          <tr v-if="visibleRows.length === 0">
            <td colspan="4" class="muted jd-empty">{{ emptyText }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="jd-raw">
      <div class="jd-raw-col">
        <div class="jd-raw-title">{{ beforeLabel }}（原始 JSON）</div>
        <pre class="jd-pre mono">{{ rawBefore }}</pre>
      </div>
      <div class="jd-raw-col">
        <div class="jd-raw-title">{{ afterLabel }}（原始 JSON）</div>
        <pre class="jd-pre mono">{{ rawAfter }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.json-diff {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.jd-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.jd-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.jd-chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--eas-radius-pill);
  font-size: var(--eas-fs-xs);
  font-weight: 600;
  background: var(--eas-tab);
}
.jd-table-wrap {
  overflow-x: auto;
}
.jd-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--eas-fs-xs);
  font-variant-numeric: tabular-nums;
}
.jd-table th,
.jd-table td {
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--eas-rule);
}
.jd-table th {
  background: var(--eas-sheet);
  color: var(--eas-ink-2);
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 2px solid var(--eas-ink);
}
.jd-table tbody tr:last-child td {
  border-bottom: none;
}
.jd-col-path {
  min-width: 160px;
}
.jd-col-kind {
  width: 48px;
}
.jd-path {
  word-break: break-all;
}
.jd-kind {
  white-space: nowrap;
}
.jd-added {
  background: var(--eas-sage-tint);
}
.jd-chip.jd-added {
  background: var(--eas-sage-tint);
  color: var(--eas-ink);
}
.jd-removed {
  background: var(--eas-danger-tint);
}
.jd-chip.jd-removed {
  background: var(--eas-rust);
  color: var(--eas-sheet);
}
.jd-changed {
  background: var(--eas-mustard-tint);
}
.jd-chip.jd-changed {
  background: var(--eas-mustard-tint);
}
.jd-added .jd-kind {
  color: var(--eas-success);
}
.jd-removed .jd-kind {
  color: var(--eas-rust);
}
.jd-changed .jd-kind {
  color: var(--eas-warning-text);
}
.jd-same {
  color: var(--eas-ink-3);
}
.jd-empty {
  text-align: center !important;
  padding: 16px !important;
}
.jd-raw {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.jd-raw-col {
  min-width: 0;
}
.jd-raw-title {
  font-size: var(--eas-fs-sm);
  font-weight: 600;
  margin-bottom: 6px;
}
.jd-pre {
  margin: 0;
  padding: 10px;
  max-height: 360px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--eas-desk);
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-control);
}
@media (max-width: 768px) {
  .jd-raw {
    grid-template-columns: 1fr;
  }
}
</style>
