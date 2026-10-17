<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { Refresh, Search } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { AppType, TaskItem } from '@/lib/types'
import { APP_TYPE_LABEL, TASK_STATUS_LABEL, toOptions } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { errorText } from '@/lib/errors'
import { useListQuery } from '@/composables/useListQuery'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useRowNavigation } from '@/composables/useRowNavigation'
import { useNoticeStore } from '@/stores/notice'
import ListEmpty from '@/components/ListEmpty.vue'
import MoneyText from '@/components/MoneyText.vue'
import StatusTag from '@/components/StatusTag.vue'
import '@/styles/listRows.css'

const props = defineProps<{ kind: 'pending' | 'done' }>()
const route = useRoute()
const router = useRouter()
const notice = useNoticeStore()
const { isMobile } = useBreakpoint()
const { isMobile: isCompact } = useBreakpoint('(max-width: 1439px)')
const pending = computed(() => props.kind === 'pending')
const title = computed(() => pending.value ? '我的待办' : '我的已办')
const typeOptions = toOptions(APP_TYPE_LABEL)
const hasUpdates = ref(false)
const ownPath = route.path
let active = true
let fetchSeq = 0
onBeforeUnmount(() => { active = false })

const list = useListQuery<{ type: AppType | null; keyword: string | null }, TaskItem>({
  defaults: { type: null, keyword: null },
  immediate: false,
  fetch: async (query) => {
    const seq = ++fetchSeq
    const eventAtStart = notice.lastAppEvent
    const type = typeOptions.some((option) => option.value === query.type) ? query.type : null
    list.filters.type = type
    const params = { ...query, type, keyword: query.keyword?.trim() || null }
    const empty = { records: [], total: 0, page: query.page, size: query.size }
    try {
      const result = await api.tasks[props.kind](params)
      // 已离开的列表不能通过末页修正改写新页面 URL，也不能消除更新后的提示。
      if (!active || route.path !== ownPath || seq !== fetchSeq) return empty
      if (notice.lastAppEvent === eventAtStart) hasUpdates.value = false
      return result
    } catch (error) {
      if (!active || route.path !== ownPath || seq !== fetchSeq) return empty
      throw error
    }
  },
})
const { filters, page, size, records, total, loading, loaded, error, hasFilters } = list
void list.load()
watch(() => notice.lastAppEvent, (event) => { if (event) hasUpdates.value = true })

function target(row: TaskItem): RouteLocationRaw {
  return { path: `/applications/${row.applicationId}`, query: pending.value && row.status === 'PENDING' ? { from: 'pending' } : undefined }
}
const { wrap: navWrap, open, onRowClick } = useRowNavigation<TaskItem>({
  target,
  rows: records,
  enabled: () => !loading.value,
})
function switchKind() {
  // 只保留当前已经查询的筛选；切换待办 / 已办时从第一页开始。
  const { page: _page, ...query } = route.query
  void router.push({ path: pending.value ? '/tasks/done' : '/tasks/pending', query })
}
</script>

<template>
  <div ref="navWrap" class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ title }}</h2>
        <div v-if="!pending" class="page-subtitle">本人已批准、已驳回或已转办的任务。</div>
      </div>
      <div class="toolbar">
        <el-button @click="switchKind">{{ pending ? '查看已办' : '查看待办' }}</el-button>
        <el-button :icon="Refresh" :loading="loading" :disabled="loading" @click="list.load()">刷新</el-button>
      </div>
    </div>
    <el-alert v-if="hasUpdates" title="收到审批相关更新，刷新可查看最新列表。" type="info" :closable="false" show-icon>
      <el-button link type="primary" :disabled="loading" @click="list.load()">刷新列表</el-button>
    </el-alert>
    <el-card shadow="never">
      <el-form class="toolbar list-filters" @submit.prevent="list.search()">
        <el-input v-model="filters.keyword" placeholder="编号或标题" aria-label="编号或标题" :prefix-icon="Search" maxlength="100" clearable @clear="list.search()" />
        <el-select v-model="filters.type" placeholder="全部申请类型" aria-label="申请类型" clearable @change="list.search()">
          <el-option v-for="option in typeOptions" :key="option.value" :value="option.value" :label="option.label" />
        </el-select>
        <el-button native-type="submit" type="primary" :disabled="loading">查询</el-button>
        <el-button v-if="hasFilters" link type="primary" :disabled="loading" @click="list.reset()">重置</el-button>
      </el-form>
      <el-skeleton v-if="!loaded && loading" class="list-body" :rows="8" animated />
      <el-result v-else-if="error" icon="warning" :title="errorText(error, '列表加载失败')">
        <template #extra><el-button type="primary" :loading="loading" @click="list.load()">重新加载</el-button></template>
      </el-result>
      <el-table
        v-else
        v-loading="loading"
        :data="records"
        row-key="taskId"
        class="list-body eas-row-table eas-row-clickable"
        @row-click="onRowClick"
      >
        <el-table-column label="申请编号" min-width="170">
          <template #default="{ row }"><router-link :to="target(row as TaskItem)" class="app-link eas-tnum">{{ row.appNo }}</router-link><el-tag v-if="pending && row.overdue" type="danger" size="small" class="overdue">已超时</el-tag></template>
        </el-table-column>
        <el-table-column label="类型 / 模板" min-width="120">
          <template #default="{ row }"><div>{{ APP_TYPE_LABEL[row.type as AppType] }}</div><div v-if="row.type === 'CUSTOM'" class="muted small">{{ row.templateName }}</div></template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ row.title || '—' }}</template></el-table-column>
        <el-table-column label="申请人 / 部门" min-width="110"><template #default="{ row }"><div>{{ row.applicant.realName }}</div><div class="muted small">{{ row.deptName || '—' }}</div></template></el-table-column>
        <el-table-column label="金额" width="130" align="right"><template #default="{ row }"><MoneyText :cents="row.amountCents" /></template></el-table-column>
        <el-table-column prop="nodeName" label="审批节点" min-width="120" show-overflow-tooltip />
        <el-table-column v-if="!pending" label="任务状态" width="100">
          <template #default="{ row }">
            <span class="dot-status" :class="`st-${String(row.status).toLowerCase()}`"><i class="dot" />{{ TASK_STATUS_LABEL[row.status as keyof typeof TASK_STATUS_LABEL] ?? row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!(pending && isCompact)" label="申请状态" width="105"><template #default="{ row }"><StatusTag :status="row.appStatus" size="small" :show-node="false" /></template></el-table-column>
        <el-table-column v-if="!isCompact" label="提交时间" width="165"><template #default="{ row }">{{ fmtDateTime(row.submittedAt) }}</template></el-table-column>
        <el-table-column v-if="pending && !isCompact" label="分配时间" width="165"><template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template></el-table-column>
        <el-table-column v-else-if="!pending && !isCompact" label="处理时间" width="165"><template #default="{ row }">{{ fmtDateTime(row.actedAt) }}</template></el-table-column>
        <el-table-column v-if="!pending" label="处理意见" min-width="200" show-overflow-tooltip><template #default="{ row }"><span :class="{ 'text-danger': row.status === 'REJECTED' }">{{ row.comment || '—' }}</span></template></el-table-column>
        <el-table-column label="操作" width="105" :fixed="isMobile ? false : 'right'">
          <template #default="{ row }">
            <div class="row-actions"><el-button link type="primary" :disabled="loading" @click.stop="open(row as TaskItem)">{{ pending && row.status === 'PENDING' ? '进入审批' : '查看详情' }}</el-button></div>
          </template>
        </el-table-column>
        <template #empty>
          <ListEmpty
            :filtered="hasFilters"
            :description="hasFilters ? undefined : pending ? '暂无待办' : '暂无已办记录'"
            @reset="list.reset()"
          />
        </template>
      </el-table>
      <div v-if="total > 0 && !error" class="pager">
        <el-pagination :current-page="page" :page-size="size" :page-sizes="[10, 20, 50, 100]" :total="total" :disabled="loading" :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next, jumper'" @current-change="list.onPageChange" @size-change="list.onSizeChange" />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.list-body { margin-top: 16px; }
.app-link { color: var(--el-color-primary); text-decoration: none; }
.overdue { margin-left: 6px; }
/* 任务状态：6px 圆点 + 文字；状态类设置 --dot 变量驱动颜色 */
.dot-status { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.dot-status .dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dot, var(--eas-muted)); }
.st-pending { --dot: var(--eas-primary); }
.st-approved { --dot: var(--eas-success); }
.st-rejected { --dot: var(--eas-danger); }
.st-canceled { --dot: var(--eas-muted); }
.st-transferred { --dot: var(--eas-warning); }
</style>
