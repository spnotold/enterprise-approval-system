<script setup lang="ts">
// 发起申请：采购、差旅、报销三个内置模板 + 已启用且适用于本部门的自定义模板
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import type { TemplateOption } from '@/lib/types'
import AdminNotice from '@/components/AdminNotice.vue'
import EmptyState from '@/components/EmptyState.vue'
import { auth, requireLogin } from '@/stores/auth'
import { notice } from '@/stores/notice'
import { showError } from '@/utils/feedback'
import { goAppList, goForm } from '@/utils/nav'

const templates = ref<TemplateOption[]>([])
const loaded = ref(false)

const builtin = computed(() => templates.value.filter((t) => t.category === 'BUILTIN'))
const custom = computed(() => templates.value.filter((t) => t.category === 'CUSTOM'))
const adminOnly = computed(() => auth.isAdminOnly)

const ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  PURCHASE: { icon: 'cart', color: '#2a78d6', bg: '#e8f1fc' },
  TRAVEL: { icon: 'paperplane', color: '#1baf7a', bg: '#e6f7f0' },
  EXPENSE: { icon: 'wallet', color: '#eb6834', bg: '#fdeee7' },
  CUSTOM: { icon: 'compose', color: '#6250d6', bg: '#efedfb' },
}

async function load(): Promise<void> {
  try {
    templates.value = await api.templates.available()
  } catch (e) {
    showError(e)
  } finally {
    loaded.value = true
    uni.stopPullDownRefresh()
  }
}

onLoad(async () => {
  if (!(await requireLogin())) return
  if (!auth.isAdminOnly) await load()
  else loaded.value = true
})

onShow(() => notice.applyBadge())
onPullDownRefresh(() => void load())

function start(t: TemplateOption): void {
  goForm(t.bizType, { templateId: t.category === 'CUSTOM' ? t.id : null })
}
</script>

<template>
  <view class="page">
    <AdminNotice v-if="adminOnly" />
    <template v-else>
      <view class="card row between" @tap="goAppList({ status: 'DRAFT' })">
        <view class="row">
          <uni-icons type="folder-add" size="22" color="#2f6bff" />
          <text class="draft-text">我的草稿</text>
        </view>
        <uni-icons type="right" size="16" color="#c0c4cc" />
      </view>

      <view v-if="builtin.length" class="section-title">常用申请</view>
      <view v-for="t in builtin" :key="t.id" class="card tpl" @tap="start(t)">
        <view class="tpl-icon" :style="{ background: ICONS[t.bizType].bg }">
          <uni-icons :type="ICONS[t.bizType].icon" size="26" :color="ICONS[t.bizType].color" />
        </view>
        <view class="flex1">
          <view class="bold">{{ t.name }}</view>
          <view class="muted ellipsis">{{ t.description || '' }}</view>
        </view>
        <uni-icons type="right" size="16" color="#c0c4cc" />
      </view>

      <view v-if="custom.length" class="section-title">其他申请</view>
      <view v-for="t in custom" :key="t.id" class="card tpl" @tap="start(t)">
        <view class="tpl-icon" :style="{ background: ICONS.CUSTOM.bg }">
          <uni-icons :type="ICONS.CUSTOM.icon" size="26" :color="ICONS.CUSTOM.color" />
        </view>
        <view class="flex1">
          <view class="bold">{{ t.name }}</view>
          <view class="muted ellipsis">{{ t.description || '' }}</view>
        </view>
        <uni-icons type="right" size="16" color="#c0c4cc" />
      </view>

      <EmptyState v-if="loaded && !templates.length" text="暂无可发起的申请类型" />
    </template>
  </view>
</template>

<style scoped>
.draft-text {
  margin-left: 12rpx;
}

.tpl {
  display: flex;
  align-items: center;
  min-height: 88rpx;
}

.tpl-icon {
  width: 88rpx;
  height: 88rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
  flex-shrink: 0;
}
</style>
