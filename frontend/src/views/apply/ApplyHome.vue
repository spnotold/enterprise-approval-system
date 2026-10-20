<script setup lang="ts">
// 发起申请：采购、差旅、报销及已启用的自定义模板；下方列出我的草稿
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/api'
import type { ApplicationSummary, AppType, TemplateOption } from '@/lib/types'
import { APP_TYPE_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { showError } from '@/lib/errors'
import MoneyText from '@/components/MoneyText.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'

const router = useRouter()
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
      <section v-for="group in [{ title: '业务申请', items: builtin }, { title: '其他申请', items: custom }]" :key="group.title" class="sheet-section">
        <h3 class="block-title">{{ group.title }}</h3>
        <p v-if="!group.items.length" class="empty-line">暂无可发起的{{ group.title }}</p>
        <div v-else class="grid">
          <router-link v-for="t in group.items" :key="t.id" :to="target(t)" class="tpl">
            <span class="tpl-name">{{ t.name }}</span>
            <span class="tpl-lines" aria-hidden="true"><i /><i /><i /></span>
            <span class="tpl-desc">{{ description(t) }}</span>
          </router-link>
        </div>
      </section>
    </template>

    <section class="drafts">
      <div class="block-head">
        <h3 class="block-title">我的草稿</h3>
        <el-button link type="primary" @click="router.push('/applications/mine?status=DRAFT')">查看全部草稿</el-button>
      </div>
      <el-table v-loading="draftsLoading" :data="drafts">
        <el-table-column label="申请" min-width="240">
          <template #default="{ row }">
            <router-link :to="`/applications/${row.id}/edit`" class="draft-link two-line">
              <span class="cell-main">{{ row.title || '未填写标题' }}</span>
              <span class="cell-sub">{{ row.templateName || APP_TYPE_LABEL[row.type as AppType] }}{{ '\u3000' }}{{ row.appNo }}</span>
              <span v-if="isMobile" class="draft-mobile-meta cell-sub">
                <span>最后保存 {{ fmtDateTime(row.updatedAt) }}</span>
                <MoneyText v-if="row.amountCents != null" :cents="row.amountCents" />
                <span v-else>无金额</span>
              </span>
            </router-link>
          </template>
        </el-table-column>
        <el-table-column v-if="!isMobile" label="金额" width="150" align="right">
          <template #default="{ row }">
            <span v-if="row.amountCents == null" class="cell-none">无</span>
            <MoneyText v-else :cents="row.amountCents" />
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
.apply-home { min-width: 0; }
.block-title {
  margin: 0 0 16px;
  font-size: var(--eas-fs-16);
  font-weight: 600;
  line-height: 1.5;
}
.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 22px 24px 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
  gap: 16px;
}
.tpl {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  background: var(--eas-sheet);
  color: var(--eas-ink);
  text-decoration: none;
  transition: border-color var(--eas-dur-fast) var(--eas-ease), transform var(--eas-dur-fast) var(--eas-ease);
}
.tpl:hover { border-color: var(--eas-primary); }
.tpl:focus-visible { outline: 2px solid var(--eas-primary); outline-offset: 2px; }
.tpl:active { transform: translateY(1px); }
.tpl-name {
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-16);
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.tpl-lines { display: grid; gap: 8px; margin: 16px 0 12px; }
.tpl-lines i { height: 1px; background: var(--eas-rule); }
.tpl-lines i:last-child { width: 60%; }
.tpl-desc { color: var(--eas-ink-3); font-size: var(--eas-fs-12); line-height: 1.5; }
.drafts { min-width: 0; border-top: 1px solid var(--eas-rule); padding-bottom: 8px; }
.draft-link { padding: 2px 0; color: var(--eas-primary); text-decoration: none; }
.draft-link:hover .cell-main { color: var(--eas-primary); text-decoration: underline; }
.draft-mobile-meta { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; }
.saved-time { font-variant-numeric: tabular-nums; }
.empty-line { margin: 0; color: var(--eas-ink-3); font-size: var(--eas-fs-14); }
@media (max-width: 767px) {
  .sheet-section { padding: 20px 16px; }
  .block-head { padding: 20px 16px 0; }
  .grid { grid-template-columns: 1fr; }
}
</style>
