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
import { applyIllustrationUrl } from '@/utils/applyIllustration'
import { showError } from '@/utils/feedback'
import { goAppList, goForm } from '@/utils/nav'

const templates = ref<TemplateOption[]>([])
const loaded = ref(false)

const builtin = computed(() => templates.value.filter((t) => t.category === 'BUILTIN'))
const custom = computed(() => templates.value.filter((t) => t.category === 'CUSTOM'))
const adminOnly = computed(() => auth.isAdminOnly)

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
      <!-- 我的草稿：横条单据 -->
      <view
        class="card draft-card"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="goAppList({ status: 'DRAFT' })"
      >
        <view class="ink-glyph ink-glyph--stack draft-glyph" />
        <view class="draft-info">
          <view class="draft-title display">我的草稿</view>
          <view class="draft-desc">继续填写尚未提交的申请</view>
        </view>
      </view>

      <!-- 常用申请 -->
      <template v-if="builtin.length">
        <view class="section-title">常用申请</view>
        <view class="apply-grid">
          <view
            v-for="t in builtin"
            :key="t.id"
            class="card apply-card"
            hover-class="is-pressed"
            :hover-stay-time="60"
            @tap="start(t)"
          >
            <view class="apply-pic">
              <image class="apply-pic-img" :src="applyIllustrationUrl(t)" mode="aspectFill" />
            </view>
            <view class="apply-name display">{{ t.name }}</view>
            <view v-if="t.description" class="apply-desc">{{ t.description }}</view>
          </view>
        </view>
      </template>

      <!-- 其他申请 -->
      <template v-if="custom.length">
        <view class="section-title">其他申请</view>
        <view class="apply-grid">
          <view
            v-for="t in custom"
            :key="t.id"
            class="card apply-card"
            hover-class="is-pressed"
            :hover-stay-time="60"
            @tap="start(t)"
          >
            <view class="apply-pic">
              <image class="apply-pic-img" :src="applyIllustrationUrl(t)" mode="aspectFill" />
            </view>
            <view class="apply-name display">{{ t.name }}</view>
            <view v-if="t.description" class="apply-desc">{{ t.description }}</view>
          </view>
        </view>
      </template>

      <EmptyState v-if="loaded && !templates.length" text="暂无可发起的申请类型" />
    </template>
  </view>
</template>

<style scoped>
.draft-card {
  display: flex;
  align-items: center;
  padding: 28rpx 32rpx;
  margin: 0 8rpx 28rpx 0;
}

.draft-glyph {
  margin-right: 20rpx;
  flex-shrink: 0;
}

.draft-info {
  flex: 1;
  min-width: 0;
}

.draft-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--eas-ink);
  line-height: 1.3;
  margin-bottom: 6rpx;
}

.draft-desc {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  line-height: 1.4;
}

.apply-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20rpx;
  row-gap: 24rpx;
  padding-right: 8rpx;
  padding-bottom: 8rpx;
  margin-bottom: 28rpx;
}

.apply-card {
  margin: 0;
  padding: 20rpx 20rpx 24rpx;
  display: flex;
  flex-direction: column;
}

.apply-pic {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 20rpx;
  overflow: hidden;
  margin-bottom: 16rpx;
  box-shadow: 0 4rpx 0 var(--eas-shade);
  background-color: var(--eas-tab);
}

.apply-pic-img {
  width: 100%;
  height: 100%;
  display: block;
}

.apply-name {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--eas-ink);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apply-desc {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
