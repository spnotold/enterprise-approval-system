<script setup lang="ts">
// 发起申请：采购、差旅、报销及已启用的自定义模板；下方列出我的草稿
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Document, Goods, Money, Promotion } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApplicationSummary, AppType, TemplateOption } from '@/lib/types'
import { APP_TYPE_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { showError } from '@/lib/errors'
import MoneyText from '@/components/MoneyText.vue'

const router = useRouter()
const templates = ref<TemplateOption[]>([])
const drafts = ref<ApplicationSummary[]>([])
const loading = ref(true)
const draftsLoading = ref(true)

const BUILTIN_META: Record<Exclude<AppType, 'CUSTOM'>, { path: string; icon: typeof Goods; desc: string }> = {
  PURCHASE: { path: '/apply/purchase', icon: Goods, desc: '采购明细、多家报价比较、拟选供应商' },
  TRAVEL: { path: '/apply/travel', icon: Promotion, desc: '行程、起止时间、预算与同行人员' },
  EXPENSE: { path: '/apply/expense', icon: Money, desc: '关联差旅 / 采购单，上传票据报销' },
}

const builtin = computed(() => templates.value.filter((t) => t.category === 'BUILTIN'))
const custom = computed(() => templates.value.filter((t) => t.category === 'CUSTOM'))

function target(t: TemplateOption): string {
  if (t.category === 'BUILTIN' && t.bizType !== 'CUSTOM') return BUILTIN_META[t.bizType].path
  return `/apply/custom/${t.id}`
}

onMounted(async () => {
  try {
    templates.value = await api.templates.available()
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
  try {
    drafts.value = (await api.applications.list({ scope: 'mine', status: 'DRAFT', page: 1, size: 5 })).records
  } catch {
    drafts.value = []
  } finally {
    draftsLoading.value = false
  }
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">发起申请</h2>
        <div class="page-subtitle">选择申请类型，先保存为草稿，确认无误后提交审批。</div>
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="4" animated />
    <template v-else>
      <el-card shadow="never">
        <template #header><span class="section-title">业务申请</span></template>
        <el-empty v-if="builtin.length === 0" :image-size="60" description="暂无可发起的业务申请" />
        <div class="grid">
          <button v-for="t in builtin" :key="t.id" type="button" class="tpl" @click="router.push(target(t))">
            <el-icon :size="28" class="tpl-icon">
              <component :is="t.bizType !== 'CUSTOM' ? BUILTIN_META[t.bizType].icon : Document" />
            </el-icon>
            <div class="tpl-body">
              <div class="tpl-name">{{ t.name }}</div>
              <div class="muted small">{{ t.description || (t.bizType !== 'CUSTOM' ? BUILTIN_META[t.bizType].desc : '') }}</div>
            </div>
          </button>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="section-title">其他申请</span></template>
        <el-empty v-if="custom.length === 0" :image-size="60" description="暂无适用于本部门的自定义申请" />
        <div class="grid">
          <button v-for="t in custom" :key="t.id" type="button" class="tpl" @click="router.push(target(t))">
            <el-icon :size="28" class="tpl-icon"><Document /></el-icon>
            <div class="tpl-body">
              <div class="tpl-name">{{ t.name }}</div>
              <div class="muted small">{{ t.description || '自定义流程' }}</div>
            </div>
          </button>
        </div>
      </el-card>
    </template>

    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <span class="section-title">我的草稿</span>
          <el-button link type="primary" @click="router.push('/applications/mine?status=DRAFT')">查看全部</el-button>
        </div>
      </template>
      <el-table v-loading="draftsLoading" :data="drafts" size="small">
        <el-table-column label="编号" width="190">
          <template #default="{ row }">
            <el-link type="primary" @click="router.push(`/applications/${row.id}/edit`)">{{ row.appNo }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="180">
          <template #default="{ row }">{{ row.title || '（未填写标题）' }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ row.templateName || APP_TYPE_LABEL[row.type as AppType] }}</template>
        </el-table-column>
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }"><MoneyText :cents="row.amountCents" /></template>
        </el-table-column>
        <el-table-column label="最后保存" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <template #empty><el-empty :image-size="60" description="暂无草稿" /></template>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.tpl {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  text-align: left;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  font: inherit;
  color: inherit;
}
.tpl:hover,
.tpl:focus-visible {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
  outline: none;
}
.tpl-icon {
  color: var(--el-color-primary);
  flex: none;
}
.tpl-name {
  font-weight: 600;
  margin-bottom: 4px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
