<script setup lang="ts">
import '@/components/admin/admin.css'
// 审计日志（只追加）：按动作、对象、操作人、日期筛选；“前后对比”以 JSON 差异显示修改前后的值
import { computed, onMounted, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { AuditLogView, UserOption } from '@/lib/types'
import { fmtDateTime } from '@/lib/datetime'
import { dateRangeModel, useListQuery } from '@/composables/useListQuery'
import ListEmpty from '@/components/ListEmpty.vue'
import JsonDiff from '@/components/JsonDiff.vue'
import UserPicker, { type UserPreset } from '@/components/UserPicker.vue'

const { filters, records, total, page, size, loading, hasFilters, search, reset, onPageChange, onSizeChange } =
  useListQuery({
    defaults: {
      action: null as string | null,
      targetType: null as string | null,
      targetId: null as string | null,
      operatorId: null as number | null,
      from: null as string | null,
      to: null as string | null,
    },
    numberKeys: ['operatorId'],
    fetch: (q) => api.admin.auditLogs.list(q),
  })

const range = dateRangeModel(filters)

function onRange(v: [string, string] | null) {
  range.value = v
  void search()
}

// ---------- 操作人筛选 ----------

const operatorPreset = ref<UserPreset[]>([])

function onOperator(v: number | number[] | null) {
  filters.operatorId = typeof v === 'number' ? v : null
  void search()
}

function onOperatorChange(users: UserOption[]) {
  operatorPreset.value = users.map((u) => ({ id: u.id, realName: u.realName, username: u.username, deptName: u.deptName }))
}

// 从 URL 打开时只有 ID：尝试查出姓名用于显示（失败时显示 ID 即可）
onMounted(async () => {
  const id = filters.operatorId
  if (id == null || operatorPreset.value.some((u) => u.id === id)) return
  try {
    const u = await api.admin.users.get(id)
    if (filters.operatorId === id) {
      operatorPreset.value = [{ id: u.id, realName: u.realName, username: u.username, deptName: u.deptName }]
    }
  } catch {
    // 无用户管理权限或用户不存在：忽略
  }
})

function filterTarget(r: AuditLogView) {
  filters.targetType = r.targetType
  filters.targetId = r.targetId
  void search()
}

// ---------- 前后对比 ----------

const current = ref<AuditLogView | null>(null)
const drawerOpen = ref(false)
const drawerTitle = computed(() => (current.value ? `前后对比：${current.value.action}` : '前后对比'))

function openDiff(r: AuditLogView) {
  current.value = r
  drawerOpen.value = true
}

function hasData(r: AuditLogView): boolean {
  return (r.beforeData !== null && r.beforeData !== undefined) || (r.afterData !== null && r.afterData !== undefined)
}
</script>

<template>
  <div class="page admin-page">
    <header class="sheet-head">
      <div>
        <h2 class="sheet-title">审计日志</h2>
        <p class="sheet-sub">管理操作只追加记录，不可修改或删除；“前后对比”显示修改前后的值。</p>
      </div>
    </header>

    <div class="toolbar list-filters">
      <el-input v-model="filters.action" placeholder="动作" clearable @keyup.enter="search" @clear="search" />
      <el-input v-model="filters.targetType" placeholder="对象类型" clearable @keyup.enter="search" @clear="search" />
      <el-input v-model="filters.targetId" placeholder="对象 ID" clearable @keyup.enter="search" @clear="search" />
      <div class="operator-filter">
        <UserPicker
          :model-value="filters.operatorId"
          :preset="operatorPreset"
          placeholder="操作人"
          @update:model-value="onOperator"
          @change="onOperatorChange"
        />
      </div>
      <el-date-picker
        :model-value="range"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        unlink-panels
        @update:model-value="onRange"
      />
      <el-button type="primary" :icon="Search" @click="search">查询</el-button>
      <el-button link type="primary" @click="reset">重置</el-button>
    </div>

    <el-table v-loading="loading" :data="records" row-key="id" class="audit-table eas-row-table">
      <el-table-column label="时间" width="150">
        <template #default="{ row }"><span class="cell-nowrap">{{ fmtDateTime(row.createdAt, true) }}</span></template>
      </el-table-column>
      <el-table-column label="操作人" width="96">
        <template #default="{ row }"><span class="cell-nowrap" :title="row.operatorName ?? '系统'">{{ row.operatorName ?? '系统' }}</span></template>
      </el-table-column>
      <el-table-column label="动作" width="130">
        <template #default="{ row }"><span class="cell-ellipsis" :title="row.action">{{ row.action }}</span></template>
      </el-table-column>
      <el-table-column label="对象" width="140">
        <template #default="{ row }">
          <el-link
            class="cell-ellipsis"
            underline="never"
            :title="`${row.targetType}${row.targetId ? ` #${row.targetId}` : ''}；点击只看该对象的记录`"
            @click="filterTarget(row as AuditLogView)"
          >
            {{ row.targetType }}<template v-if="row.targetId"> #{{ row.targetId }}</template>
          </el-link>
        </template>
      </el-table-column>
      <el-table-column label="原因" width="200">
        <template #default="{ row }"><span class="cell-ellipsis" :title="row.reason ?? ''">{{ row.reason ?? '—' }}</span></template>
      </el-table-column>
      <el-table-column label="IP" width="105">
        <template #default="{ row }"><span class="cell-nowrap">{{ row.ip ?? '—' }}</span></template>
      </el-table-column>
      <el-table-column label="操作" width="84">
        <template #default="{ row }">
          <span v-if="hasData(row as AuditLogView)" class="row-actions">
            <el-button link type="primary" @click="openDiff(row as AuditLogView)">前后对比</el-button>
          </span>
          <span v-else class="muted small">无数据</span>
        </template>
      </el-table-column>
      <template #empty>
        <ListEmpty :filtered="hasFilters" @reset="reset" />
      </template>
    </el-table>

    <el-pagination
      class="pager"
      layout="total, sizes, prev, pager, next"
      :total="total"
      :current-page="page"
      :page-size="size"
      background
      @current-change="onPageChange"
      @size-change="onSizeChange"
    />

    <el-drawer v-model="drawerOpen" :title="drawerTitle" size="min(960px, 100%)" destroy-on-close>
      <template v-if="current">
        <el-descriptions :column="2" border size="small" class="diff-meta">
          <el-descriptions-item label="时间">{{ fmtDateTime(current.createdAt, true) }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{ current.operatorName ?? '系统' }}</el-descriptions-item>
          <el-descriptions-item label="动作">{{ current.action }}</el-descriptions-item>
          <el-descriptions-item label="对象">
            {{ current.targetType }}<template v-if="current.targetId"> #{{ current.targetId }}</template>
          </el-descriptions-item>
          <el-descriptions-item label="IP">{{ current.ip ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="原因">
            <span class="pre-wrap">{{ current.reason ?? '—' }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <JsonDiff :before="current.beforeData" :after="current.afterData" />
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.operator-filter {
  width: 180px;
}
.audit-table {
  width: 100%;
}
.audit-table :deep(.cell) {
  padding-right: 8px;
  padding-left: 8px;
}
.cell-nowrap {
  white-space: nowrap;
}
.cell-ellipsis {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-table .el-link.cell-ellipsis {
  display: block;
}
.diff-meta {
  margin-bottom: 16px;
}
@media (max-width: 768px) {
  .operator-filter {
    width: 100%;
  }
}
</style>
