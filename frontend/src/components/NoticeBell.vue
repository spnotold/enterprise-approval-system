<script setup lang="ts">
// 顶部通知铃铛：未读角标 + 最近通知
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { noticeTarget, useNoticeStore } from '@/stores/notice'
import type { NotificationItem } from '@/lib/types'
import { NOTIFICATION_TYPE_LABEL } from '@/lib/labels'
import { fromNow } from '@/lib/datetime'
import { showError } from '@/lib/errors'

const notice = useNoticeStore()
const router = useRouter()
const visible = ref(false)
const loading = ref(false)
const bellLabel = computed(() => (notice.unread > 0 ? `通知，${notice.unread} 条未读` : '通知'))

async function onShow() {
  loading.value = true
  try {
    await notice.fetchRecent()
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
}

async function open(n: NotificationItem) {
  visible.value = false
  // 先标记已读，再跳转
  if (!n.read) await notice.markRead(n.id).catch(() => undefined)
  const target = noticeTarget(n)
  if (target) await router.push(target)
}

async function readAll() {
  try {
    await notice.markAllRead()
  } catch (e) {
    showError(e)
  }
}

function viewAll() {
  visible.value = false
  void router.push('/notifications')
}
</script>

<template>
  <el-popover
    v-model:visible="visible"
    placement="bottom-end"
    :width="360"
    trigger="click"
    :show-arrow="false"
    popper-class="notice-popper"
    @show="onShow"
  >
    <template #reference>
      <button class="bell" type="button" :aria-label="bellLabel">
        <el-badge :value="notice.unread" :hidden="notice.unread === 0" :max="99" class="bell-badge">
          <el-icon :size="20"><Bell /></el-icon>
        </el-badge>
      </button>
    </template>
    <div class="notice-panel">
      <div class="notice-head">
        <span class="notice-heading">通知<span v-if="notice.unread" class="muted">{{ notice.unread }} 条未读</span></span>
        <el-button link type="primary" :disabled="notice.unread === 0" @click="readAll">全部已读</el-button>
      </div>
      <div v-loading="loading" class="notice-list">
        <el-empty v-if="!loading && notice.recent.length === 0" :image-size="48" description="暂无通知" />
        <div
          v-for="n in notice.recent"
          :key="n.id"
          class="notice-item"
          :class="{ unread: !n.read }"
          role="button"
          tabindex="0"
          @click="open(n)"
          @keydown.enter="open(n)"
          @keydown.space.prevent="open(n)"
        >
          <span class="unread-dot" aria-hidden="true" />
          <div class="notice-body">
            <div class="notice-title">{{ n.title }}</div>
            <div class="notice-meta small">
              <span>{{ NOTIFICATION_TYPE_LABEL[n.type] ?? n.type }}</span>
              <span>{{ fromNow(n.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="notice-foot">
        <el-button link type="primary" @click="viewAll">打开通知中心</el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.bell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: var(--eas-radius-control);
  background: transparent;
  cursor: pointer;
  color: var(--eas-ink);
  transition: background var(--eas-dur-fast) var(--eas-ease);
}
.bell:hover {
  background: var(--eas-paper);
}
.bell-badge :deep(.el-badge__content) {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border: 1px solid var(--eas-surface);
  background: var(--eas-danger);
  font-size: var(--eas-fs-xs);
  line-height: 14px;
  font-variant-numeric: tabular-nums;
}
.notice-head,
.notice-foot {
  display: flex;
  align-items: center;
  padding: 10px 16px;
}
.notice-head {
  justify-content: space-between;
  border-bottom: 1px solid var(--eas-rule);
}
.notice-heading {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-weight: 600;
}
.notice-heading .muted {
  font-size: var(--eas-fs-xs);
  font-weight: 400;
}
.notice-foot {
  justify-content: center;
  border-top: 1px solid var(--eas-rule);
}
.notice-list {
  max-height: 360px;
  min-height: 80px;
  overflow-y: auto;
}
.notice-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px 10px 13px;
  border-left: 3px solid transparent;
  border-bottom: 1px solid var(--eas-paper-deep);
  cursor: pointer;
}
.notice-item:last-child {
  border-bottom: none;
}
.notice-item:hover,
.notice-item:focus-visible {
  background: var(--eas-paper);
  border-left-color: var(--eas-primary);
}
.notice-item:focus-visible {
  outline-offset: -2px;
}
.unread-dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin-top: 8px;
  border-radius: 50%;
  background: transparent;
}
.notice-item.unread .unread-dot {
  background: var(--eas-primary);
}
.notice-body {
  flex: 1;
  min-width: 0;
}
.notice-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice-meta {
  display: flex;
  gap: 12px;
  color: var(--eas-ink-3);
}
</style>

<style>
.notice-popper.el-popper {
  padding: 0;
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
  box-shadow: var(--eas-shadow-float);
}
</style>
