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
      <strong v-else class="num">{{ application.appNo }}</strong>
      <span class="linked-type">{{ APP_TYPE_LABEL[application.type] }}</span>
      <MoneyText :cents="application.amountCents" strong class="linked-amount" />
    </div>
    <div v-if="application.title" class="linked-title pre-wrap">{{ application.title }}</div>
    <dl v-if="application.travel" class="linked-fields">
      <dt>行程</dt><dd>{{ application.travel.origin ?? '—' }} 至 {{ application.travel.destination ?? '—' }}</dd>
      <dt>起止时间</dt><dd class="num">{{ fmtDateTime(application.travel.startTime) }} 至 {{ fmtDateTime(application.travel.endTime) }}</dd>
      <dt>自然日</dt><dd class="num">{{ application.travel.naturalDays ?? '—' }} 天</dd>
      <dt>预算</dt><dd><MoneyText :cents="application.travel.budgetCents" /></dd>
    </dl>
    <dl v-if="application.purchase" class="linked-fields">
      <dt>选定供应商</dt><dd>{{ application.purchase.selectedSupplier ?? '—' }}</dd>
      <dt>选定金额</dt><dd><MoneyText :cents="application.purchase.selectedAmountCents" /></dd>
      <dt>采购明细</dt><dd class="num">{{ application.purchase.itemCount }} 项</dd>
    </dl>
    <div class="linked-foot">通过于 <span class="num">{{ fmtDateTime(application.finishedAt) }}</span></div>
  </div>
</template>

<style scoped>
.linked-card { min-width: 0; padding: 12px 16px; border: 1px solid var(--eas-rule); border-radius: var(--eas-radius-control); background: var(--eas-sheet); font-size: var(--eas-fs-sm); line-height: 1.6; }
.linked-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
.linked-type { color: var(--eas-ink-2); font-size: var(--eas-fs-xs); }
.linked-amount { margin-left: auto; }
.linked-title { margin-top: 4px; color: var(--eas-ink); overflow-wrap: anywhere; }
.linked-fields { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; margin: 8px 0 0; padding-top: 8px; border-top: 1px solid var(--eas-rule); }
.linked-fields + .linked-fields { margin-top: 0; border-top: 0; padding-top: 2px; }
.linked-fields dt { color: var(--eas-ink-2); white-space: nowrap; }
.linked-fields dd { margin: 0; overflow-wrap: anywhere; }
.linked-foot { margin-top: 8px; color: var(--eas-ink-3); font-size: var(--eas-fs-xs); }
.num { font-variant-numeric: tabular-nums; }
.app-link { display: inline-flex; align-items: center; min-height: 32px; box-sizing: border-box; padding: 4px 0; color: var(--eas-primary); text-decoration: none; font-variant-numeric: tabular-nums; font-weight: 600; transition: color var(--eas-dur-fast) var(--eas-ease); }
.app-link:hover { color: var(--eas-primary-hover); text-decoration: underline; }
.app-link:focus-visible { outline: 2px solid var(--eas-primary); outline-offset: 2px; border-radius: var(--eas-radius-tag); }
</style>
