<script setup lang="ts">
// 邮件投递记录：MailDispatcher 发送通知邮件的状态、重试次数与最后错误
import { Refresh } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { DeliveryView } from '@/lib/types'
import { DELIVERY_STATUS_LABEL, toOptions } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { useListQuery } from '@/composables/useListQuery'
import ListEmpty from '@/components/ListEmpty.vue'

type DeliveryStatus = DeliveryView['status']

const STATUS_TAG: Record<DeliveryStatus, 'primary' | 'success' | 'info' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  SENT: 'success',
  FAILED: 'danger',
  SKIPPED: 'info',
}

const statusOptions = toOptions(DELIVERY_STATUS_LABEL)

const { filters, records, total, page, size, loading, hasFilters, search, reset, onPageChange, onSizeChange, load } =
  useListQuery({
    defaults: { status: null as DeliveryStatus | null },
    fetch: (q) => api.admin.deliveries.list(q),
  })
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">邮件投递</h2>
        <div class="page-subtitle">通知邮件的发送记录。邮件只含标题、编号、状态等摘要，不含金额明细和票据。</div>
      </div>
    </div>

    <el-alert type="info" :closable="false" show-icon>
      <template #title>失败按 1、2、4、8、16 分钟退避重试，5 次后标记失败；站内通知不受影响。</template>
    </el-alert>

    <el-card shadow="never">
      <div class="toolbar">
        <el-select v-model="filters.status" placeholder="投递状态" clearable @change="search">
          <el-option v-for="o in statusOptions" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-button @click="reset">重置</el-button>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>

      <el-table v-loading="loading" :data="records" row-key="id" class="delivery-table">
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.createdAt, true) }}</template>
        </el-table-column>
        <el-table-column prop="recipientEmail" label="收件人" min-width="180" show-overflow-tooltip />
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAG[row.status as DeliveryStatus] ?? 'info'" disable-transitions>
              {{ DELIVERY_STATUS_LABEL[row.status as DeliveryStatus] ?? row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="attempts" label="尝试次数" width="90" align="right" />
        <el-table-column label="下次重试" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.nextRetryAt, true) }}</template>
        </el-table-column>
        <el-table-column label="最后错误" min-width="200">
          <template #default="{ row }">
            <el-tooltip v-if="row.lastError" placement="top" :show-after="200">
              <template #content>
                <div class="error-tip">{{ row.lastError }}</div>
              </template>
              <span class="ellipsis text-danger small">{{ row.lastError }}</span>
            </el-tooltip>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="发送时间" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.sentAt, true) }}</template>
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
    </el-card>
  </div>
</template>

<style scoped>
.delivery-table {
  margin-top: 12px;
  width: 100%;
}
.ellipsis {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: default;
}
.error-tip {
  max-width: 420px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
