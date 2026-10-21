<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { Refresh, Search } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { AppType, TaskItem } from '@/lib/types'
import { APP_TYPE_LABEL, TASK_STATUS_LABEL, toOptions } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { formatCents } from '@/lib/money'
import { errorText } from '@/lib/errors'
import { useListQuery } from '@/composables/useListQuery'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useRowNavigation } from '@/composables/useRowNavigation'
import { useSectionActionsTarget } from '@/composables/useSectionActionsTarget'
import { useNoticeStore } from '@/stores/notice'
import ListEmpty from '@/components/ListEmpty.vue'
import MoneyText from '@/components/MoneyText.vue'
import StatusTag from '@/components/StatusTag.vue'
import { taskDotClass } from '@/components/tasks/dotStatus'
import '@/styles/listRows.css'

const props = defineProps<{ kind: 'pending' | 'done' }>()
const route = useRoute()
const router = useRouter()
const notice = useNoticeStore()
const { isMobile } = useBreakpoint()
const pending = computed(() => props.kind === 'pending')
const typeOptions = toOptions(APP_TYPE_LABEL)
const hasUpdates = ref(false)
// 外壳为本栏目渲染了页签行时，刷新放到页签行右侧；否则留在工具栏里。
// 栏目内页面可见性随权限/路由变化，目标存在性需在每次路由渲染后重新探测。
const hasActionsTarget = useSectionActionsTarget()
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

/** 定制申请显示模板名，其余显示类型名 */
function typeText(row: TaskItem): string {
  return row.type === 'CUSTOM' ? row.templateName : APP_TYPE_LABEL[row.type as AppType]
}
/** 第二行：类型与单号，中间隔一个全角空格 */
function subLine(row: TaskItem): string {
  return `${typeText(row)}\u3000${row.appNo}`
}
function actionText(row: TaskItem): string {
  return pending.value && row.status === 'PENDING' ? '处理' : '查看'
}
function taskStatusText(status: TaskItem['status']): string {
  return TASK_STATUS_LABEL[status as keyof typeof TASK_STATUS_LABEL] ?? status
}
const emptyText = computed(() => (pending.value ? '暂无待办' : '暂无已办记录'))
const otherPath = computed(() => (pending.value ? '/tasks/done' : '/tasks/pending'))
const otherText = computed(() => (pending.value ? '查看已办' : '查看待办'))
</script>

<template>
  <div ref="navWrap" class="page">
    <div class="sheet">
      <div v-if="hasUpdates" class="list-note" role="status">
        <span>收到审批相关更新，刷新可查看最新列表。</span>
        <el-button link type="primary" :disabled="loading" @click="list.load()">刷新列表</el-button>
      </div>
      <el-form class="toolbar list-filters" @submit.prevent="list.search()">
        <el-input v-model="filters.keyword" placeholder="编号或标题" aria-label="编号或标题" :prefix-icon="Search" maxlength="100" clearable @clear="list.search()" />
        <el-select v-model="filters.type" placeholder="全部申请类型" aria-label="申请类型" clearable @change="list.search()">
          <el-option v-for="option in typeOptions" :key="option.value" :value="option.value" :label="option.label" />
        </el-select>
        <el-button native-type="submit" type="primary" :disabled="loading">查询</el-button>
        <el-button v-if="hasFilters" link type="primary" :disabled="loading" @click="list.reset()">重置</el-button>
        <Teleport to="#section-actions" defer :disabled="!hasActionsTarget">
          <div class="list-actions">
            <el-button :icon="Refresh" :loading="loading" :disabled="loading" @click="list.load()">刷新</el-button>
          </div>
        </Teleport>
      </el-form>
      <el-skeleton v-if="!loaded && loading" class="list-state" :rows="8" animated />
      <el-result v-else-if="error" icon="warning" :title="errorText(error, '列表加载失败')">
        <template #extra><el-button type="primary" :loading="loading" @click="list.load()">重新加载</el-button></template>
      </el-result>
      <!-- 窄屏用卡片：待办列多，表格会挤掉标题 -->
      <div v-else-if="isMobile" v-loading="loading" class="mobile-cards">
        <article v-for="row in records" :key="row.taskId" class="mobile-card">
          <router-link :to="target(row as TaskItem)" class="mobile-card-main">
            <span class="mobile-card-top">
              <span class="mobile-card-no">{{ subLine(row as TaskItem) }}</span>
              <StatusTag v-if="!pending" :status="row.appStatus" size="small" :show-node="false" />
            </span>
            <span class="mobile-card-title">{{ row.title || '（未填写标题）' }}<span v-if="pending && row.overdue" class="tag-overdue">已超时</span></span>
            <span class="mobile-card-meta">
              <span>{{ row.applicant.realName }}</span>
              <span v-if="row.deptName">{{ row.deptName }}</span>
              <span>{{ row.nodeName }}</span>
              <span v-if="row.amountCents != null">¥{{ formatCents(row.amountCents) }}</span>
              <span>{{ fmtDateTime(pending ? row.submittedAt : row.actedAt) }}</span>
            </span>
            <span v-if="!pending" class="mobile-card-task">
              <span :class="taskDotClass(row.status)">{{ taskStatusText(row.status) }}</span>
              <span v-if="row.comment" class="mobile-card-comment" :class="{ 'text-danger': row.status === 'REJECTED' }">{{ row.comment }}</span>
            </span>
            <span class="mobile-card-go">{{ actionText(row as TaskItem) }}</span>
          </router-link>
        </article>
        <ListEmpty
          v-if="loaded && records.length === 0"
          :filtered="hasFilters"
          :description="hasFilters ? undefined : emptyText"
          @reset="list.reset()"
        >
          <template #action><el-button v-if="!hasFilters" @click="router.push(otherPath)">{{ otherText }}</el-button></template>
        </ListEmpty>
      </div>
      <el-table
        v-else
        v-loading="loading"
        :data="records"
        row-key="taskId"
        class="eas-row-table eas-row-clickable"
        @row-click="onRowClick"
      >
        <el-table-column label="申请" :min-width="pending ? 320 : 280">
          <template #default="{ row }">
            <div class="two-line">
              <div class="cell-main">
                <router-link :to="target(row as TaskItem)" class="cell-link">{{ row.title || '（未填写标题）' }}</router-link><span v-if="pending && row.overdue" class="tag-overdue">已超时</span>
              </div>
              <div class="cell-sub">{{ subLine(row as TaskItem) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="申请人" width="120">
          <template #default="{ row }">
            <div class="two-line">
              <div>{{ row.applicant.realName }}</div>
              <div v-if="row.deptName" class="cell-sub">{{ row.deptName }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="pending ? '当前节点' : '审批节点'" width="150" prop="nodeName" />
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">
            <MoneyText v-if="row.amountCents != null" :cents="row.amountCents" />
            <span v-else class="cell-none">无</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!pending" label="处理结果" width="190">
          <template #default="{ row }">
            <div class="two-line">
              <div :class="taskDotClass(row.status)">{{ taskStatusText(row.status) }}</div>
              <div v-if="row.comment" class="cell-sub cell-sub--clip" :class="{ 'text-danger': row.status === 'REJECTED' }" :title="row.comment">{{ row.comment }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="!pending" label="申请状态" width="100">
          <template #default="{ row }"><StatusTag :status="row.appStatus" size="small" :show-node="false" /></template>
        </el-table-column>
        <el-table-column :label="pending ? '提交时间' : '处理时间'" width="160">
          <template #default="{ row }"><span class="cell-nowrap eas-tnum">{{ fmtDateTime(pending ? row.submittedAt : row.actedAt) }}</span></template>
        </el-table-column>
        <el-table-column width="96">
          <template #header><span class="eas-sr-only">操作</span></template>
          <template #default="{ row }">
            <div class="row-actions row-actions--end">
              <el-button
                v-if="pending && row.status === 'PENDING'"
                size="small"
                type="primary"
                :disabled="loading"
                @click.stop="open(row as TaskItem)"
              >处理</el-button>
              <el-button v-else link type="primary" :disabled="loading" @click.stop="open(row as TaskItem)">查看</el-button>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <ListEmpty
            :filtered="hasFilters"
            :description="hasFilters ? undefined : emptyText"
            @reset="list.reset()"
          >
            <template #action><el-button v-if="!hasFilters" @click="router.push(otherPath)">{{ otherText }}</el-button></template>
          </ListEmpty>
        </template>
      </el-table>
      <div v-if="total > 0 && !error" class="pager">
        <el-pagination :current-page="page" :page-size="size" :page-sizes="[10, 20, 50, 100]" :total="total" :disabled="loading" :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next, jumper'" @current-change="list.onPageChange" @size-change="list.onSizeChange" />
      </div>
    </div>
  </div>
</template>
