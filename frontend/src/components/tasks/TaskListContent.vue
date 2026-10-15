<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh, Search } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { AppType, TaskItem } from '@/lib/types'
import { APP_TYPE_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TAG, toOptions } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { errorText } from '@/lib/errors'
import { useListQuery } from '@/composables/useListQuery'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNoticeStore } from '@/stores/notice'
import ListEmpty from '@/components/ListEmpty.vue'
import MoneyText from '@/components/MoneyText.vue'
import StatusTag from '@/components/StatusTag.vue'

const props = defineProps<{ kind: 'pending' | 'done' }>()
const route = useRoute()
const router = useRouter()
const notice = useNoticeStore()
const { isMobile } = useBreakpoint()
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

function target(value: object) {
  const row = value as TaskItem
  return { path: `/applications/${row.applicationId}`, query: pending.value && row.status === 'PENDING' ? { from: 'pending' } : undefined }
}
function open(row: object) {
  if (!loading.value) void router.push(target(row))
}
function switchKind() {
  // 只保留当前已经查询的筛选；切换待办 / 已办时从第一页开始。
  const { page: _page, ...query } = route.query
  void router.push({ path: pending.value ? '/tasks/done' : '/tasks/pending', query })
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ title }}</h2>
        <div class="page-subtitle">{{ pending ? '只显示分配给本人的待办；进入详情核对业务内容和流程后审批。' : '显示本人已批准、已驳回或已转办的任务，保留处理结果与意见。' }}</div>
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
      <el-form class="toolbar" @submit.prevent="list.search()">
        <el-input v-model="filters.keyword" placeholder="编号或标题" aria-label="编号或标题" :prefix-icon="Search" maxlength="100" clearable @clear="list.search()" />
        <el-select v-model="filters.type" placeholder="全部申请类型" aria-label="申请类型" clearable @change="list.search()">
          <el-option v-for="option in typeOptions" :key="option.value" :value="option.value" :label="option.label" />
        </el-select>
        <el-button native-type="submit" type="primary" :disabled="loading">查询</el-button>
        <el-button v-if="hasFilters" :disabled="loading" @click="list.reset()">清空筛选</el-button>
      </el-form>
      <el-skeleton v-if="!loaded && loading" class="list-body" :rows="8" animated />
      <el-result v-else-if="error" icon="warning" :title="errorText(error, '列表加载失败')">
        <template #extra><el-button type="primary" :loading="loading" @click="list.load()">重新加载</el-button></template>
      </el-result>
      <el-table v-else v-loading="loading" :data="records" row-key="taskId" class="list-body" @row-dblclick="open">
        <el-table-column label="申请编号" min-width="190">
          <template #default="{ row }"><router-link :to="target(row)" class="app-link">{{ row.appNo }}</router-link><el-tag v-if="pending && row.overdue" type="danger" size="small" class="overdue">已超时</el-tag></template>
        </el-table-column>
        <el-table-column label="类型 / 模板" min-width="150">
          <template #default="{ row }"><div>{{ APP_TYPE_LABEL[row.type as AppType] }}</div><div v-if="row.type === 'CUSTOM'" class="muted small">{{ row.templateName }}</div></template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="190" show-overflow-tooltip><template #default="{ row }">{{ row.title || '—' }}</template></el-table-column>
        <el-table-column label="申请人 / 部门" min-width="140"><template #default="{ row }"><div>{{ row.applicant.realName }}</div><div class="muted small">{{ row.deptName || '—' }}</div></template></el-table-column>
        <el-table-column label="金额" width="145" align="right"><template #default="{ row }"><MoneyText :cents="row.amountCents" /></template></el-table-column>
        <el-table-column prop="nodeName" label="审批节点" min-width="140" />
        <el-table-column label="任务状态" width="100"><template #default="{ row }"><el-tag :type="TASK_STATUS_TAG[row.status as keyof typeof TASK_STATUS_TAG]" size="small">{{ TASK_STATUS_LABEL[row.status as keyof typeof TASK_STATUS_LABEL] }}</el-tag></template></el-table-column>
        <el-table-column label="申请状态" width="105"><template #default="{ row }"><StatusTag :status="row.appStatus" size="small" :show-node="false" /></template></el-table-column>
        <el-table-column label="提交时间" width="165"><template #default="{ row }">{{ fmtDateTime(row.submittedAt) }}</template></el-table-column>
        <el-table-column v-if="pending" label="分配时间" width="165"><template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template></el-table-column>
        <el-table-column v-else label="处理时间" width="165"><template #default="{ row }">{{ fmtDateTime(row.actedAt) }}</template></el-table-column>
        <el-table-column v-if="!pending" label="处理意见" min-width="200" show-overflow-tooltip><template #default="{ row }"><span :class="{ 'text-danger': row.status === 'REJECTED' }">{{ row.comment || '—' }}</span></template></el-table-column>
        <el-table-column label="操作" width="105" fixed="right"><template #default="{ row }"><el-button link type="primary" :disabled="loading" @click="open(row)">{{ pending && row.status === 'PENDING' ? '进入审批' : '查看详情' }}</el-button></template></el-table-column>
        <template #empty><ListEmpty :filtered="hasFilters" :description="hasFilters ? undefined : pending ? '暂无待办' : '暂无已办记录'" @reset="list.reset()" /></template>
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
</style>
