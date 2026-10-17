<script setup lang="ts">
// 申请列表：我的申请（mine）/ 本部门申请（dept）/ 授权范围申请（granted）
// 筛选：类型、状态、提交日期、关键词；筛选与分页同步到 URL
import { computed, onMounted } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApplicationSummary, AppStatus, AppType, ListScope } from '@/lib/types'
import { APP_STATUS_LABEL, APP_TYPE_LABEL, toOptions } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { dateRangeModel, useListQuery } from '@/composables/useListQuery'
import { useAction } from '@/composables/useAction'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useRowNavigation } from '@/composables/useRowNavigation'
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
const { isMobile: isCompact } = useBreakpoint('(max-width: 1439px)')

const TITLES: Record<ListScope, { title: string; sub: string }> = {
  mine: { title: '我的申请', sub: '' },
  dept: { title: '本部门申请', sub: '本人负责部门的已提交申请（不含草稿），部门按提交时所属部门统计。' },
  granted: { title: '授权范围申请', sub: '管理员授予的数据范围内的已提交申请。' },
}

const typeOptions = toOptions(APP_TYPE_LABEL)
const statusOptions = computed(() =>
  toOptions(APP_STATUS_LABEL).filter((o) => props.scope === 'mine' || o.value !== 'DRAFT'),
)
const headDepts = computed(() => auth.me?.headDeptIds ?? [])

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

onMounted(() => {
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
    onConflict: () => q.load(),
  })
  if (r) await q.load()
}

async function remove(row: ApplicationSummary) {
  const ok = await act.run({
    confirm: { title: '删除草稿', message: `确定删除草稿 ${row.appNo}？删除后不可恢复。`, danger: true, confirmText: '删除' },
    action: async () => {
      await api.applications.remove(row.id)
      return true
    },
    success: '草稿已删除',
    onConflict: () => q.load(),
  })
  if (ok) await q.load()
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

const EMPTY_TEXT: Record<ListScope, string> = {
  mine: '暂无申请。点击右上角「发起申请」开始填写。',
  dept: '本部门暂无已提交的申请。',
  granted: '授权范围内暂无已提交的申请。',
}
</script>

<template>
  <div ref="navWrap" class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ TITLES[scope].title }}</h2>
        <div v-if="TITLES[scope].sub" class="page-subtitle">{{ TITLES[scope].sub }}</div>
      </div>
      <el-button v-if="scope === 'mine' && auth.can('APP_CREATE')" type="primary" @click="router.push('/apply')">发起申请</el-button>
    </div>

    <el-card shadow="never">
      <div class="toolbar list-filters">
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
        <el-select v-model="q.filters.status" placeholder="状态" aria-label="申请状态" clearable @change="q.search()">
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
      </div>

      <el-table
        v-loading="q.loading.value"
        :data="q.records.value"
        row-key="id"
        class="app-table eas-row-table eas-row-clickable"
        @row-click="onRowClick"
      >
        <el-table-column label="编号" width="170" :fixed="isMobile ? false : 'left'">
          <template #default="{ row }">
            <router-link :to="target(row as ApplicationSummary)" class="app-link eas-tnum">{{ row.appNo }}</router-link>
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.title || '（未填写标题）' }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.templateName || APP_TYPE_LABEL[row.type as AppType] }}</template>
        </el-table-column>
        <el-table-column v-if="scope !== 'mine'" label="申请人" width="100">
          <template #default="{ row }">{{ row.applicant.realName }}</template>
        </el-table-column>
        <el-table-column v-if="scope !== 'mine' && !isCompact" label="部门" width="110" prop="deptName" />
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }"><MoneyText :cents="row.amountCents" /></template>
        </el-table-column>
        <el-table-column label="状态" min-width="200" show-overflow-tooltip>
          <template #default="{ row }"><StatusTag :status="row.status" :current-node="row.currentNode" size="small" /></template>
        </el-table-column>
        <el-table-column v-if="!isCompact" label="提交时间" width="150">
          <template #default="{ row }">{{ fmtDateTime(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column v-if="scope === 'mine' && !isCompact" label="更新时间" width="150">
          <template #default="{ row }">{{ fmtDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" :width="scope === 'mine' ? 190 : 80" :fixed="isMobile ? false : 'right'">
          <template #default="{ row }">
            <div class="row-actions">
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
            v-if="q.loaded.value"
            :filtered="q.hasFilters.value"
            :description="q.hasFilters.value ? undefined : EMPTY_TEXT[scope]"
            @reset="q.reset()"
          />
          <span v-else />
        </template>
      </el-table>
      <el-pagination
        class="pager"
        background
        :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
        :pager-count="isMobile ? 5 : 7"
        :total="q.total.value"
        :current-page="q.page.value"
        :page-size="q.size.value"
        :page-sizes="[10, 20, 50, 100]"
        @current-change="q.onPageChange"
        @size-change="q.onSizeChange"
      />
    </el-card>
  </div>
</template>

<style scoped>
.app-table {
  margin-top: 12px;
}
.app-link {
  color: var(--el-color-primary);
  text-decoration: none;
}
</style>
