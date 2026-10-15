<script setup lang="ts">
// 顶部通知铃铛：未读角标 + 最近通知
import { ref } from 'vue'
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
  <el-popover v-model:visible="visible" placement="bottom-end" :width="360" trigger="click" @show="onShow">
    <template #reference>
      <button class="bell" type="button" aria-label="通知">
        <el-badge :value="notice.unread" :hidden="notice.unread === 0" :max="99">
          <el-icon :size="20"><Bell /></el-icon>
        </el-badge>
      </button>
    </template>
    <div class="notice-panel">
      <div class="notice-head">
        <span>通知<template v-if="notice.unread">（{{ notice.unread }} 条未读）</template></span>
        <el-button link type="primary" :disabled="notice.unread === 0" @click="readAll">全部已读</el-button>
      </div>
      <div v-loading="loading" class="notice-list">
        <el-empty v-if="!loading && notice.recent.length === 0" :image-size="60" description="暂无通知" />
        <div
          v-for="n in notice.recent"
          :key="n.id"
          class="notice-item"
          :class="{ unread: !n.read }"
          role="button"
          tabindex="0"
          @click="open(n)"
          @keydown.enter="open(n)"
        >
          <div class="notice-title">
            <span v-if="!n.read" class="dot" />
            <el-tag size="small" disable-transitions>{{ NOTIFICATION_TYPE_LABEL[n.type] ?? n.type }}</el-tag>
            <span class="text">{{ n.title }}</span>
          </div>
          <div class="muted small">{{ fromNow(n.createdAt) }}</div>
        </div>
      </div>
      <div class="notice-foot">
        <el-button link type="primary" @click="viewAll">查看全部</el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.bell {
  display: inline-flex;
  align-items: center;
  padding: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
}
.notice-head,
.notice-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
}
.notice-foot {
  justify-content: center;
  padding: 8px 0 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.notice-list {
  max-height: 360px;
  min-height: 80px;
  overflow-y: auto;
}
.notice-item {
  padding: 8px 4px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  cursor: pointer;
}
.notice-item:hover {
  background: var(--el-fill-color-light);
}
.notice-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.notice-title .text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice-item.unread .text {
  font-weight: 600;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-danger);
  flex: none;
}
</style>
