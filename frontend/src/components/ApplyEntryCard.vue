<script setup lang="ts">
// 发起申请入口卡：上为 4:3 套色小插画（圆角 12、4px 纸影硬投影），下为展示字单据名与 12px 简短说明。
// 悬停或键盘聚焦时插画抬起 2px，硬投影切换为芥黄错版。
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { TemplateOption } from '@/lib/types'
import {
  resolveApplyIllustrationKey,
  type ApplyIllustrationKey,
} from '@/components/workbench/format'
import purchaseImg from '@/assets/illustrations/apply-purchase.webp'
import travelImg from '@/assets/illustrations/apply-travel.webp'
import expenseImg from '@/assets/illustrations/apply-expense.webp'
import leaveImg from '@/assets/illustrations/apply-leave.webp'
import sealImg from '@/assets/illustrations/apply-seal.webp'
import genericImg from '@/assets/illustrations/apply-generic.webp'

const props = withDefaults(
  defineProps<{
    template: TemplateOption
    to: RouteLocationRaw
    description?: string | null
    large?: boolean
  }>(),
  {
    description: undefined,
    large: false,
  },
)

const ILLUSTRATIONS: Record<ApplyIllustrationKey, string> = {
  purchase: purchaseImg,
  travel: travelImg,
  expense: expenseImg,
  leave: leaveImg,
  seal: sealImg,
  generic: genericImg,
}

const illustration = computed(() => ILLUSTRATIONS[resolveApplyIllustrationKey(props.template)])
</script>

<template>
  <router-link :to="to" class="apply-entry" :class="{ 'apply-entry--large': large }">
    <span class="apply-entry-pic">
      <img :src="illustration" alt="" width="400" height="300" loading="lazy" />
    </span>
    <b class="apply-entry-name">{{ template.name }}</b>
    <span v-if="description" class="apply-entry-desc">{{ description }}</span>
  </router-link>
</template>

<style scoped>
.apply-entry {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: var(--eas-radius-control);
  color: var(--eas-ink);
  text-decoration: none;
}
.apply-entry-pic {
  display: block;
  overflow: hidden;
  border-radius: var(--eas-radius-control);
  background: var(--eas-tab);
  box-shadow: 4px 4px 0 var(--eas-shade);
  transition:
    transform var(--eas-dur-fast) var(--eas-ease),
    box-shadow var(--eas-dur-fast) var(--eas-ease);
}
.apply-entry-pic img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.apply-entry:is(:hover, :focus-visible) .apply-entry-pic {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 var(--eas-mustard);
}
.apply-entry:active .apply-entry-pic {
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 var(--eas-shade);
}
.apply-entry-name {
  display: block;
  margin-top: 10px;
  font-family: var(--eas-font-display);
  font-size: 19px;
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
  overflow-wrap: anywhere;
}
.apply-entry--large .apply-entry-name {
  margin-top: 12px;
  font-size: 21px;
}
.apply-entry-desc {
  margin-top: 2px;
  font-size: var(--eas-fs-12);
  line-height: 1.45;
  color: var(--eas-ink-3);
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  .apply-entry-pic {
    transition: none;
  }
  .apply-entry:is(:hover, :focus-visible, :active) .apply-entry-pic {
    transform: none;
  }
}
</style>
