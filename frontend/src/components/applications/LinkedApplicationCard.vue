<script setup lang="ts">
import type { LinkableApplication } from '@/lib/types'
import { APP_TYPE_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import MoneyText from '@/components/MoneyText.vue'

withDefaults(defineProps<{ application: LinkableApplication; navigable?: boolean }>(), { navigable: true })
</script>

<template>
  <div class="linked-card">
    <div class="linked-heading">
      <router-link v-if="navigable" :to="`/applications/${application.id}`" class="app-link">{{ application.appNo }}</router-link>
      <strong v-else class="mono">{{ application.appNo }}</strong>
      <el-tag size="small" type="info" effect="plain">{{ APP_TYPE_LABEL[application.type] }}</el-tag>
      <MoneyText :cents="application.amountCents" strong />
    </div>
    <div v-if="application.title" class="pre-wrap">{{ application.title }}</div>
    <el-descriptions v-if="application.travel" :column="1" size="small">
      <el-descriptions-item label="行程">{{ application.travel.origin ?? '—' }} → {{ application.travel.destination ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="起止时间">{{ fmtDateTime(application.travel.startTime) }} 至 {{ fmtDateTime(application.travel.endTime) }}</el-descriptions-item>
      <el-descriptions-item label="自然日">{{ application.travel.naturalDays ?? '—' }} 天</el-descriptions-item>
      <el-descriptions-item label="预算"><MoneyText :cents="application.travel.budgetCents" /></el-descriptions-item>
    </el-descriptions>
    <el-descriptions v-if="application.purchase" :column="1" size="small">
      <el-descriptions-item label="选定供应商">{{ application.purchase.selectedSupplier ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="选定金额"><MoneyText :cents="application.purchase.selectedAmountCents" /></el-descriptions-item>
      <el-descriptions-item label="采购明细">{{ application.purchase.itemCount }} 项</el-descriptions-item>
    </el-descriptions>
    <div class="muted small">通过时间：{{ fmtDateTime(application.finishedAt) }}</div>
  </div>
</template>

<style scoped>
.linked-card { padding: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.linked-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
.app-link { color: var(--el-color-primary); text-decoration: none; }
</style>
