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
  <div class="apply-home">
    <h2 class="home-title">发起申请</h2>
    <p class="home-sub">选择申请类型，先保存为草稿，确认无误后提交审批。</p>

    <div class="panel">
      <el-skeleton v-if="loading" :rows="4" animated />
      <template v-else>
        <section class="block">
          <h3 class="block-title">业务申请</h3>
          <el-empty v-if="builtin.length === 0" :image-size="60" description="暂无可发起的业务申请" />
          <div class="grid">
            <button v-for="t in builtin" :key="t.id" type="button" class="tpl" @click="router.push(target(t))">
              <el-icon :size="24" class="tpl-icon">
                <component :is="t.bizType !== 'CUSTOM' ? BUILTIN_META[t.bizType].icon : Document" />
              </el-icon>
              <span class="tpl-body">
                <span class="tpl-name">{{ t.name }}</span>
                <span class="tpl-desc">{{ t.description || (t.bizType !== 'CUSTOM' ? BUILTIN_META[t.bizType].desc : '') }}</span>
              </span>
            </button>
          </div>
        </section>

        <section class="block">
          <h3 class="block-title">其他申请</h3>
          <el-empty v-if="custom.length === 0" :image-size="60" description="暂无适用于本部门的自定义申请" />
          <div class="grid">
            <button v-for="t in custom" :key="t.id" type="button" class="tpl" @click="router.push(target(t))">
              <el-icon :size="24" class="tpl-icon"><Document /></el-icon>
              <span class="tpl-body">
                <span class="tpl-name">{{ t.name }}</span>
                <span class="tpl-desc">{{ t.description || '自定义流程' }}</span>
              </span>
            </button>
          </div>
        </section>
      </template>

      <section class="block">
        <div class="block-head">
          <h3 class="block-title">我的草稿</h3>
          <el-button link type="primary" @click="router.push('/applications/mine?status=DRAFT')">查看全部草稿</el-button>
        </div>
        <el-table v-loading="draftsLoading" :data="drafts" size="small">
          <el-table-column label="编号" width="190">
            <template #default="{ row }">
              <el-link type="primary" class="app-no" @click="router.push(`/applications/${row.id}/edit`)">{{ row.appNo }}</el-link>
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
      </section>
    </div>
  </div>
</template>

<style scoped>
.apply-home {
  max-width: 1200px;
}
.home-title {
  margin: 0;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-xl);
  font-weight: 600;
  line-height: 1.4;
  color: var(--eas-ink);
}
.home-sub {
  margin: 4px 0 16px;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}
.panel {
  padding: 0 24px;
  background: var(--eas-surface);
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
}
.block {
  padding: 20px 0 24px;
}
.block + .block {
  border-top: 1px solid var(--eas-rule);
}
.block-title {
  margin: 0 0 12px;
  font-size: var(--eas-fs-md);
  font-weight: 600;
  line-height: 1.5;
  color: var(--eas-ink);
}
.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
.tpl {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 64px;
  padding: 14px 16px;
  text-align: left;
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
  background: var(--eas-surface);
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition:
    border-color var(--eas-dur-fast) var(--eas-ease),
    transform var(--eas-dur-fast) var(--eas-ease);
}
.tpl:hover {
  border-color: var(--eas-primary);
}
.tpl:focus-visible {
  border-color: var(--eas-primary);
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.tpl:active {
  transform: translateY(1px);
}
.tpl-icon {
  flex: none;
  margin-top: 2px;
  color: var(--eas-ink-2);
}
.tpl-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tpl-name {
  font-size: var(--eas-fs-md);
  font-weight: 600;
  line-height: 1.5;
  color: var(--eas-ink);
}
.tpl-desc {
  font-size: var(--eas-fs-sm);
  line-height: 1.6;
  color: var(--eas-ink-2);
  white-space: normal;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
.app-no {
  font-variant-numeric: tabular-nums;
}
</style>
