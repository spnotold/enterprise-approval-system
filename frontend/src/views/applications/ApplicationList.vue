<script setup lang="ts">
// 申请列表：我的申请（mine）/ 本部门申请（dept）/ 授权范围申请（granted）
// 筛选：类型、状态、提交日期、关键词；筛选与分页同步到 URL
import { computed, onMounted, ref } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApplicationSummary, AppStatus, AppType, ListScope } from '@/lib/types'
import { APP_STATUS_LABEL, APP_TYPE_LABEL, toOptions } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { formatCents } from '@/lib/money'
import { errorText } from '@/lib/errors'
import { dateRangeModel, useListQuery } from '@/composables/useListQuery'
import { useAction } from '@/composables/useAction'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useRowNavigation } from '@/composables/useRowNavigation'
import { useSectionActionsTarget } from '@/composables/useSectionActionsTarget'
import { useAuthStore } from '@/stores/auth'
import { useDictStore } from '@/stores/dict'
import StatusTag from '@/components/StatusTag.vue'
import MoneyText from '@/components/MoneyText.vue'
import ListEmpty from '@/components/ListEmpty.vue'
import '@/styles/listRows.css'

const props = defineProps<{ scope: ListScope }>()
const router = useRouter()
const auth = useAuthStore()
const dict = useDictStore()
const { isMobile } = useBreakpoint()
// 外壳在 767px 以下收起页签，「发起申请」入口改由页面操作区承接
const { isMobile: isNarrow } = useBreakpoint('(max-width: 767px)')

const typeOptions = toOptions(APP_TYPE_LABEL)
const statusOptions = computed(() =>
  toOptions(APP_STATUS_LABEL).filter((o) => props.scope === 'mine' || o.value !== 'DRAFT'),
)
const headDepts = computed(() => auth.me?.headDeptIds ?? [])
const canCreate = computed(() => props.scope === 'mine' && auth.can('APP_CREATE'))
// 外壳为本栏目渲染了页签行时，页面操作放到页签行右侧；否则留在工具栏里。
// 同一实例会被多个列表范围复用，目标存在性需随路由变化重新探测。
const hasActionsTarget = useSectionActionsTarget()

const q = useListQuery({
  defaults: {
    type: null as AppType | null,
    status: null as AppStatus | null,
    from: null as string | null,
    to: null as string | null,
    keyword: null as string | null,
    deptId: null as number | null,
  },
  numberKeys: ['deptId'],
  fetch: (f) => api.applications.list({ ...f, scope: props.scope }),
})
const range = dateRangeModel(q.filters)

// ---------- 我的申请：状态筛选的数量 ----------
const statusCounts = ref<Record<AppStatus, number> | null>(null)
const statusTabs = computed(() => {
  const counts = statusCounts.value
  const all = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : null
  return [
    { value: null as AppStatus | null, count: all },
    ...statusOptions.value.map((o) => ({ value: o.value as AppStatus, count: counts ? (counts[o.value as AppStatus] ?? 0) : null })),
  ]
})
async function loadCounts() {
  if (props.scope !== 'mine') return
  try {
    statusCounts.value = (await api.stats.personal()).statusCounts
  } catch {
    // 数量只是提示，失败时不显示
  }
}
function pickStatus(status: AppStatus | null) {
  if (q.filters.status === status) return
  q.filters.status = status
  void q.search()
}
/** 重新加载列表，并同步状态数量 */
async function reload() {
  await Promise.all([q.load(), loadCounts()])
}

onMounted(() => {
  void loadCounts()
  if (props.scope === 'dept' && headDepts.value.length > 1) void dict.loadDepartments().catch(() => undefined)
})

// ---------- 行操作（我的申请） ----------
const act = useAction()

async function withdraw(row: ApplicationSummary) {
  const r = await act.run({
    confirm: {
      title: '撤回申请',
      message: `确定撤回 ${row.appNo}？撤回后待办将失效，审批人会收到取消通知；撤回后可“复制并修改”重新提交。`,
      danger: true,
      confirmText: '撤回',
    },
    action: (key) => api.applications.withdraw(row.id, { appVersion: row.version }, key),
    success: '已撤回',
    onConflict: () => reload(),
  })
  if (r) await reload()
}

async function remove(row: ApplicationSummary) {
  const ok = await act.run({
    confirm: { title: '删除草稿', message: `确定删除草稿 ${row.appNo}？删除后不可恢复。`, danger: true, confirmText: '删除' },
    action: async () => {
      await api.applications.remove(row.id)
      return true
    },
    success: '草稿已删除',
    onConflict: () => reload(),
  })
  if (ok) await reload()
}

async function copy(row: ApplicationSummary) {
  const r = await act.run({
    confirm: {
      title: '复制并修改',
      message: `将以 ${row.appNo} 为来源生成一张新草稿（新编号），业务内容和附件一并复制，原单的审批历史不变。`,
      type: 'info',
      confirmText: '复制',
    },
    action: () => api.applications.copy(row.id),
  })
  if (r) {
    ElMessage.success(`已复制为新草稿 ${r.appNo}`)
    await router.push(`/applications/${r.id}/edit`)
  }
}

function target(row: ApplicationSummary): RouteLocationRaw {
  return row.status === 'DRAFT' && props.scope === 'mine' ? `/applications/${row.id}/edit` : `/applications/${row.id}`
}
const { wrap: navWrap, onRowClick } = useRowNavigation<ApplicationSummary>({ target, rows: q.records, enabled: () => !q.loading.value })

function typeText(row: ApplicationSummary): string {
  return row.templateName || APP_TYPE_LABEL[row.type as AppType]
}

/** 第二行：类型与单号，中间隔一个全角空格 */
function subLine(row: ApplicationSummary): string {
  return `${typeText(row)}\u3000${row.appNo}`
}

const EMPTY_TEXT: Record<ListScope, string> = {
  mine: '暂无申请',
  dept: '本部门暂无已提交的申请',
  granted: '授权范围内暂无已提交的申请',
}
/** 我的申请只选了状态时，直接说明该状态下没有单据 */
const emptyDescription = computed(() => {
  const f = q.filters
  if (props.scope === 'mine' && f.status && !f.keyword && !f.type && !f.from && !f.to) {
    return f.status === 'DRAFT' ? '暂无草稿' : `暂无${APP_STATUS_LABEL[f.status]}的申请`
  }
  return q.hasFilters.value ? undefined : EMPTY_TEXT[props.scope]
})
</script>

<template>
  <div ref="navWrap" class="page">
    <div class="sheet">
      <div class="toolbar list-filters list-filters--wrap">
        <div v-if="scope === 'mine'" class="status-filters" role="group" aria-label="申请状态">
          <button
            v-for="tab in statusTabs"
            :key="tab.value ?? 'all'"
            type="button"
            class="status-filter"
            :class="{ 'is-active': q.filters.status === tab.value }"
            :aria-pressed="q.filters.status === tab.value"
            @click="pickStatus(tab.value)"
          >
            <StatusTag v-if="tab.value" :status="tab.value" :show-node="false" />
            <span v-else>全部</span>
            <span v-if="tab.count !== null" class="status-filter-count">{{ tab.count }}</span>
          </button>
        </div>
        <el-input
          v-model="q.filters.keyword"
          placeholder="编号或标题"
          aria-label="编号或标题"
          clearable
          :prefix-icon="Search"
          @keyup.enter="q.search()"
          @clear="q.search()"
        />
        <el-select v-model="q.filters.type" placeholder="类型" aria-label="申请类型" clearable @change="q.search()">
          <el-option v-for="o in typeOptions" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-select v-if="scope !== 'mine'" v-model="q.filters.status" placeholder="状态" aria-label="申请状态" clearable @change="q.search()">
          <el-option v-for="o in statusOptions" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-select
          v-if="scope === 'dept' && headDepts.length > 1"
          v-model="q.filters.deptId"
          placeholder="全部负责部门"
          aria-label="负责部门"
          clearable
          @change="q.search()"
        >
          <el-option v-for="id in headDepts" :key="id" :value="id" :label="dict.deptName(id)" />
        </el-select>
        <el-date-picker
          v-model="range"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="提交日期起"
          end-placeholder="提交日期止"
          unlink-panels
          @change="q.search()"
        />
        <el-button type="primary" @click="q.search()">查询</el-button>
        <el-button v-if="q.hasFilters.value" link type="primary" @click="q.reset()">重置</el-button>
        <Teleport to="#section-actions" defer :disabled="!hasActionsTarget">
          <div class="list-actions">
            <el-button v-if="canCreate && isNarrow" type="primary" @click="router.push('/apply')">发起申请</el-button>
            <el-button :icon="Refresh" :loading="q.loading.value" :disabled="q.loading.value" @click="reload()">刷新</el-button>
          </div>
        </Teleport>
      </div>

      <div v-if="q.error.value" class="mobile-error">
        <span>{{ errorText(q.error.value, '列表加载失败') }}</span>
        <el-button link type="primary" :loading="q.loading.value" @click="reload()">重新加载</el-button>
      </div>
      <el-skeleton
        v-else-if="isMobile && !q.loaded.value && q.loading.value"
        class="list-state"
        :rows="6"
        animated
      />
      <!-- 窄屏用卡片：数据表列多，卡片把标题、状态和操作放在同一视线内 -->
      <div v-else-if="isMobile" v-loading="q.loading.value" class="mobile-cards">
        <article v-for="row in q.records.value" :key="row.id" class="mobile-card">
          <router-link :to="target(row as ApplicationSummary)" class="mobile-card-main">
            <span class="mobile-card-top">
              <span class="mobile-card-no">{{ subLine(row as ApplicationSummary) }}</span>
              <StatusTag :status="row.status" :current-node="row.currentNode" size="small" :show-node="false" />
            </span>
            <span class="mobile-card-title">{{ row.title || '（未填写标题）' }}</span>
            <span class="mobile-card-meta">
              <span v-if="scope !== 'mine'">{{ row.applicant.realName }}</span>
              <span v-if="scope !== 'mine' && row.deptName">{{ row.deptName }}</span>
              <template v-if="row.currentNode && row.status === 'IN_APPROVAL'">
                <span>{{ row.currentNode.name }}</span>
                <span v-if="row.currentNode.assigneeName">{{ row.currentNode.assigneeName }}</span>
              </template>
              <span v-if="row.amountCents != null">¥{{ formatCents(row.amountCents) }}</span>
              <span>{{ fmtDateTime(row.submittedAt ?? row.updatedAt) }}</span>
            </span>
          </router-link>
          <div v-if="scope === 'mine'" class="mobile-card-actions">
            <template v-if="row.status === 'DRAFT'">
              <el-button link type="primary" @click="router.push(`/applications/${row.id}/edit`)">编辑</el-button>
              <el-button link type="danger" :disabled="act.loading.value" @click="remove(row as ApplicationSummary)">删除</el-button>
            </template>
            <el-button
              v-else-if="row.status === 'IN_APPROVAL'"
              link
              type="warning"
              :disabled="act.loading.value"
              @click="withdraw(row as ApplicationSummary)"
            >
              撤回
            </el-button>
            <el-button
              v-else-if="row.status === 'REJECTED' || row.status === 'WITHDRAWN'"
              link
              type="primary"
              :disabled="act.loading.value"
              @click="copy(row as ApplicationSummary)"
            >
              复制并修改
            </el-button>
          </div>
        </article>
        <ListEmpty
          v-if="q.loaded.value && !q.records.value.length"
          :filtered="q.hasFilters.value"
          :description="emptyDescription"
          @reset="q.reset()"
        >
          <template #action><el-button v-if="canCreate" type="primary" @click="router.push('/apply')">填写申请</el-button></template>
        </ListEmpty>
      </div>

      <el-table
        v-else
        v-loading="q.loading.value"
        :data="q.records.value"
        row-key="id"
        class="eas-row-table eas-row-clickable"
        @row-click="onRowClick"
      >
        <el-table-column label="申请" min-width="300">
          <template #default="{ row }">
            <div class="two-line">
              <div class="cell-main">
                <router-link :to="target(row as ApplicationSummary)" class="cell-link">{{ row.title || '（未填写标题）' }}</router-link>
              </div>
              <div class="cell-sub">{{ subLine(row as ApplicationSummary) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="scope !== 'mine'" label="申请人" width="120">
          <template #default="{ row }">
            <div class="two-line">
              <div>{{ row.applicant.realName }}</div>
              <div v-if="row.deptName" class="cell-sub">{{ row.deptName }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="当前节点" width="150">
          <template #default="{ row }">
            <div v-if="row.currentNode && row.status === 'IN_APPROVAL'" class="two-line">
              <div>{{ row.currentNode.name }}</div>
              <div v-if="row.currentNode.assigneeName" class="cell-sub">{{ row.currentNode.assigneeName }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">
            <MoneyText v-if="row.amountCents != null" :cents="row.amountCents" />
            <span v-else class="cell-none">无</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag :status="row.status" size="small" :show-node="false" /></template>
        </el-table-column>
        <el-table-column label="提交时间" width="150">
          <template #default="{ row }">
            <span v-if="row.submittedAt" class="cell-nowrap eas-tnum">{{ fmtDateTime(row.submittedAt) }}</span>
            <span v-else class="cell-none">未提交</span>
          </template>
        </el-table-column>
        <el-table-column v-if="scope === 'mine'" label="更新时间" width="150">
          <template #default="{ row }"><span class="cell-nowrap eas-tnum">{{ fmtDateTime(row.updatedAt) }}</span></template>
        </el-table-column>
        <el-table-column :width="scope === 'mine' ? 180 : 96">
          <template #header><span class="eas-sr-only">操作</span></template>
          <template #default="{ row }">
            <div class="row-actions row-actions--end">
              <el-button link type="primary" @click.stop="router.push(`/applications/${row.id}`)">查看</el-button>
              <template v-if="scope === 'mine'">
                <template v-if="row.status === 'DRAFT'">
                  <el-button link type="primary" @click.stop="router.push(`/applications/${row.id}/edit`)">编辑</el-button>
                  <el-button link type="danger" :disabled="act.loading.value" @click.stop="remove(row as ApplicationSummary)">删除</el-button>
                </template>
                <el-button
                  v-else-if="row.status === 'IN_APPROVAL'"
                  link
                  type="warning"
                  :disabled="act.loading.value"
                  @click.stop="withdraw(row as ApplicationSummary)"
                >
                  撤回
                </el-button>
                <el-button
                  v-else-if="row.status === 'REJECTED' || row.status === 'WITHDRAWN'"
                  link
                  type="primary"
                  :disabled="act.loading.value"
                  @click.stop="copy(row as ApplicationSummary)"
                >
                  复制并修改
                </el-button>
              </template>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <ListEmpty
            v-if="q.loaded.value && !q.error.value"
            :filtered="q.hasFilters.value"
            :description="emptyDescription"
            @reset="q.reset()"
          >
            <template #action><el-button v-if="canCreate" type="primary" @click="router.push('/apply')">填写申请</el-button></template>
          </ListEmpty>
          <span v-else />
        </template>
      </el-table>
      <div v-if="q.total.value > 0 && !q.error.value" class="pager">
        <el-pagination
          :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
          :pager-count="isMobile ? 5 : 7"
          :total="q.total.value"
          :current-page="q.page.value"
          :page-size="q.size.value"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="q.onPageChange"
          @size-change="q.onSizeChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 我的申请的状态筛选：一排带数量的文字，选中项加粗，前面是该状态的圆点 */
.status-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  flex: 1 0 100%;
}
.status-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--eas-ink-2);
  font: inherit;
  font-size: var(--eas-fs-sm);
  cursor: pointer;
}
.status-filter:hover {
  color: var(--eas-ink);
}
.status-filter.is-active {
  color: var(--eas-ink);
  font-weight: 600;
}
.status-filter :deep(.status-tag .label) {
  color: inherit;
}
.status-filter-count {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
</style>
