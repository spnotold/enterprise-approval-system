<script setup lang="ts">
// 发起申请：采购、差旅、报销及已启用的自定义模板（套色插画入口卡）；下方列出我的草稿
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import type { ApplicationSummary, AppType, TemplateOption } from '@/lib/types'
import { APP_TYPE_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { showError } from '@/lib/errors'
import ApplyEntryCard from '@/components/ApplyEntryCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useRowNavigation } from '@/composables/useRowNavigation'

const { isMobile } = useBreakpoint()
const templates = ref<TemplateOption[]>([])
const drafts = ref<ApplicationSummary[]>([])
const loading = ref(true)
const draftsLoading = ref(true)

const BUILTIN_META: Record<Exclude<AppType, 'CUSTOM'>, { path: string; desc: string }> = {
  PURCHASE: { path: '/apply/purchase', desc: '采购明细与报价' },
  TRAVEL: { path: '/apply/travel', desc: '行程与出差预算' },
  EXPENSE: { path: '/apply/expense', desc: '费用明细与票据' },
}

const builtin = computed(() => templates.value.filter((t) => t.category === 'BUILTIN'))
const custom = computed(() => templates.value.filter((t) => t.category === 'CUSTOM'))

function target(t: TemplateOption): string {
  if (t.category === 'BUILTIN' && t.bizType !== 'CUSTOM') return BUILTIN_META[t.bizType].path
  return `/apply/custom/${t.id}`
}

function description(t: TemplateOption): string {
  if (t.category === 'BUILTIN' && t.bizType !== 'CUSTOM') return BUILTIN_META[t.bizType].desc
  return [...(t.description?.split(/[，。；\n]/)[0]?.trim() || '按模板填写申请')].slice(0, 10).join('')
}

const { wrap: draftWrap, onRowClick: onDraftRowClick } = useRowNavigation<ApplicationSummary>({
  target: (row) => `/applications/${row.id}/edit`,
  rows: drafts,
  enabled: () => !draftsLoading.value,
})

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
  <div class="apply-home sheet">
    <el-skeleton v-if="loading" class="sheet-section" :rows="4" animated />
    <template v-else>
      <section
        v-for="(group, idx) in [{ title: '业务申请', items: builtin }, { title: '其他申请', items: custom }]"
        :key="group.title"
        class="sheet-section"
      >
        <h2 class="section-title block-title">
          <i v-if="idx === 0" class="ink-glyph ink-glyph--leaf" aria-hidden="true" />{{ group.title }}
        </h2>
        <p v-if="!group.items.length" class="empty-line">暂无可发起的{{ group.title }}</p>
        <div v-else class="grid">
          <ApplyEntryCard
            v-for="t in group.items"
            :key="t.id"
            :template="t"
            :to="target(t)"
            :description="description(t)"
            large
          />
        </div>
      </section>
    </template>

    <section ref="draftWrap" class="drafts">
      <div class="sheet-head block-head">
        <h2 class="block-title">我的草稿</h2>
        <router-link to="/applications/mine?status=DRAFT" class="text-link">查看全部草稿</router-link>
      </div>
      <el-table v-loading="draftsLoading" :data="drafts" class="draft-table eas-row-clickable" @row-click="onDraftRowClick">
        <el-table-column label="申请" min-width="240">
          <template #default="{ row }">
            <router-link :to="`/applications/${row.id}/edit`" class="draft-link two-line" @click.stop>
              <span class="cell-main">{{ row.title || '未填写标题' }}</span>
              <span class="cell-sub">{{ row.templateName || APP_TYPE_LABEL[row.type as AppType] }}{{ '\u3000' }}{{ row.appNo }}</span>
              <span v-if="isMobile" class="draft-mobile-meta cell-sub">
                <span>最后保存 {{ fmtDateTime(row.updatedAt) }}</span>
                <MoneyText v-if="row.amountCents != null" class="draft-amount" :cents="row.amountCents" />
                <span v-else>无金额</span>
              </span>
            </router-link>
          </template>
        </el-table-column>
        <el-table-column v-if="!isMobile" label="金额" width="150" align="right">
          <template #default="{ row }">
            <span v-if="row.amountCents == null" class="cell-none">无</span>
            <MoneyText v-else class="draft-amount" :cents="row.amountCents" />
          </template>
        </el-table-column>
        <el-table-column v-if="!isMobile" label="最后保存" width="180">
          <template #default="{ row }"><span class="saved-time">{{ fmtDateTime(row.updatedAt) }}</span></template>
        </el-table-column>
        <template #empty><span class="empty-line">暂无草稿</span></template>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.apply-home {
  min-width: 0;
}
.block-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 18px;
}
.block-head {
  flex-wrap: wrap;
}
.block-head a {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
}
.block-head .block-title {
  margin: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr));
  gap: 24px;
}
.drafts {
  min-width: 0;
  padding-bottom: 10px;
  border-top: 2px dashed var(--eas-rule);
}
.draft-table :deep(.el-table__body .el-table__row) {
  cursor: pointer;
}
.draft-table :deep(.el-table__row:focus-visible) {
  outline: 2px solid var(--eas-ink);
  outline-offset: -2px;
}
.draft-link {
  padding: 2px 0;
  color: var(--eas-ink);
  text-decoration: none;
}
.draft-link:hover .cell-main {
  color: var(--eas-primary);
}
.draft-amount {
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-16);
  font-weight: 600;
}
.draft-mobile-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 6px;
}
.saved-time {
  font-variant-numeric: tabular-nums;
}
.empty-line {
  margin: 0;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-14);
}
@media (max-width: 767px) {
  .apply-home {
    --eas-sheet-inset: 16px;
  }
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
}
</style>
