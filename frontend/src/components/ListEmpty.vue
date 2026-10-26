<script setup lang="ts">
// 空状态（docs/ui_design.md 5.9）：居中圆形插画（背后芥黄错版圆）+ 展示字标题 + 一句说明 + 操作按钮。
// 普通空列表用 empty-tray，筛选后无结果用 empty-search；下一步的操作放 action 插槽（默认插槽同样可用，兼容旧写法）。
import { computed } from 'vue'
import emptyTray from '@/assets/illustrations/empty-tray.webp'
import emptySearch from '@/assets/illustrations/empty-search.webp'

const props = withDefaults(
  defineProps<{
    filtered?: boolean
    /** 标题；缺省时按 filtered 给出「暂无数据 / 没有符合条件的记录」 */
    description?: string
    /** 说明（标题下一行）；缺省时 filtered 给一句引导 */
    hint?: string
    /** 插画直径（px），默认 210；小卡片里可以传小一点 */
    imageSize?: number
  }>(),
  { filtered: false, imageSize: 210 },
)
defineEmits<{ reset: [] }>()

const illustration = computed(() => (props.filtered ? emptySearch : emptyTray))
const title = computed(() => props.description ?? (props.filtered ? '没有符合条件的记录' : '暂无数据'))
const hint = computed(() => props.hint ?? (props.filtered ? '换个关键词，或清空筛选重新查看。' : ''))
</script>

<template>
  <div class="list-empty">
    <div class="pic" :style="{ width: `${imageSize}px`, height: `${imageSize}px` }">
      <img :src="illustration" alt="" :width="imageSize" :height="imageSize" loading="lazy" />
    </div>
    <h3 class="title">{{ title }}</h3>
    <p v-if="hint" class="hint">{{ hint }}</p>
    <div v-if="filtered || $slots.default || $slots.action" class="actions">
      <el-button v-if="filtered" @click="$emit('reset')">清空筛选</el-button>
      <slot name="action" />
      <slot />
    </div>
  </div>
</template>

<style scoped>
.list-empty {
  padding: 52px 24px 56px;
  text-align: center;
}
/* 圆形插画 + 背后芥黄错版圆 */
.pic {
  position: relative;
  margin: 0 auto 22px;
}
.pic::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--eas-mustard);
  transform: translate(9px, 9px);
}
.pic img {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.title {
  margin: 0;
  font-family: var(--eas-font-display);
  font-size: 26px;
  font-weight: 400;
  line-height: var(--eas-lh-title);
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
}
.hint {
  margin: 6px 0 0;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-sm);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}
.actions .el-button + .el-button {
  margin-left: 0;
}
/* 小卡片里紧凑一些 */
@media (max-width: 768px) {
  .list-empty {
    padding: 36px 16px 44px;
  }
}
</style>
