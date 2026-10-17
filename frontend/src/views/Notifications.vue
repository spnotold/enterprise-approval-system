<script setup lang="ts">
// 通知中心：全部 / 未读分页列表；点击先标记已读再跳转；支持单条与全部标为已读
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import { errorText, showError } from '@/lib/errors'
import { NOTIFICATION_TYPE_LABEL } from '@/lib/labels'
import { fmtDateTime, fromNow } from '@/lib/datetime'
import { useListQuery } from '@/composables/useListQuery'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { noticeTarget, useNoticeStore } from '@/stores/notice'
import ListEmpty from '@/components/ListEmpty.vue'
import type { NotificationItem, NotificationType } from '@/lib/types'

const router = useRouter()
const notice = useNoticeStore()
const { isMobile } = useBreakpoint()

const list = useListQuery<{ unreadOnly: boolean }, NotificationItem>({
  defaults: { unreadOnly: false },
  fetch: (q) => api.notifications.list(q),
})
const { filters, records, total, page, size, loading, loaded, error } = list

const tab = computed({
  get: () => (filters.unreadOnly ? 'unread' : 'all'),
  set: (v: string) => {
    filters.unreadOnly = v === 'unread'
    void list.search()
  },
})

const TYPE_TAG: Partial<Record<NotificationType, 'primary' | 'success' | 'warning' | 'danger' | 'info'>> = {
  TASK_ASSIGNED: 'primary',
  URGE: 'warning',
  TASK_OVERDUE: 'warning',
  APP_APPROVED: 'success',
  NODE_APPROVED: 'success',
  REGISTRATION_APPROVED: 'success',
  APP_REJECTED: 'danger',
}

const busyId = ref<number | null>(null)
const markingAll = ref(false)
const hasUnread = computed(() => notice.unread > 0 || records.value.some((n) => !n.read))

async function markOne(n: NotificationItem) {
  if (n.read || busyId.value !== null) return
  busyId.value = n.id
  try {
    await notice.markRead(n.id)
    n.read = true
    // 未读列表中已读的条目不再属于当前筛选
    if (filters.unreadOnly) await list.load()
  } catch (e) {
    showError(e, '标记失败')
  } finally {
    busyId.value = null
  }
}

async function open(n: NotificationItem) {
  if (!n.read) {
    try {
      await notice.markRead(n.id)
      n.read = true
    } catch {
      // 标记失败不影响跳转
    }
  }
  const target = noticeTarget(n)
  if (target) await router.push(target)
  else if (filters.unreadOnly) await list.load()
}

/** Ctrl / ⌘ 点击或中键点击：同步打开新标签页，并在后台标记已读。 */
function openInNewTab(n: NotificationItem) {
  const target = noticeTarget(n)
  if (target) window.open(router.resolve(target).href, '_blank', 'noopener')
  if (!n.read) {
    void notice.markRead(n.id).then(async () => {
      n.read = true
      if (filters.unreadOnly) await list.load()
    }).catch(() => undefined)
  }
}

function activate(n: NotificationItem, e: MouseEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    openInNewTab(n)
    return
  }
  void open(n)
}

function onAuxClick(n: NotificationItem, e: MouseEvent) {
  if (e.button !== 1) return
  // 中键点在行尾操作按钮上时不触发
  if ((e.target as HTMLElement | null)?.closest?.('.notice-actions')) return
  e.preventDefault()
  openInNewTab(n)
}

async function markAll() {
  markingAll.value = true
  try {
    await notice.markAllRead()
    ElMessage.success('已全部标为已读')
    await list.load()
  } catch (e) {
    showError(e, '操作失败')
  } finally {
    markingAll.value = false
  }
}

onMounted(() => void notice.fetchUnread())

// 收到实时推送时，第一页自动刷新
watch(
  () => notice.lastEventAt,
  () => {
    if (page.value === 1 && !loading.value) void list.load()
  },
)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">通知中心</h2>
        <div class="page-subtitle">点击通知可查看对应申请。</div>
      </div>
      <div class="toolbar">
        <el-button :icon="Refresh" :loading="loading" @click="list.load()">刷新</el-button>
        <el-button type="primary" plain :loading="markingAll" :disabled="!hasUnread" @click="markAll">
          全部标为已读
        </el-button>
      </div>
    </div>

    <el-card shadow="never" class="list-card">
      <el-tabs v-model="tab" class="tabs">
        <el-tab-pane name="all" label="全部" />
        <el-tab-pane name="unread">
          <template #label>
            未读<el-badge v-if="notice.unread > 0" :value="notice.unread" :max="99" class="tab-badge" />
          </template>
        </el-tab-pane>
      </el-tabs>

      <el-result v-if="error" icon="warning" :title="errorText(error, '通知加载失败')">
        <template #extra><el-button type="primary" :loading="loading" @click="list.load()">重新加载</el-button></template>
      </el-result>
      <el-skeleton v-else-if="!loaded" :rows="6" animated />
      <div v-else v-loading="loading">
        <ListEmpty
          v-if="!records.length"
          :description="filters.unreadOnly ? '没有未读通知' : '暂无通知'"
        />
        <ul v-else class="notice-list">
          <li
            v-for="n in records"
            :key="n.id"
            class="notice-row"
            :class="{ unread: !n.read }"
            @click="activate(n, $event)"
            @auxclick="onAuxClick(n, $event)"
            @mousedown.middle.prevent
          >
            <span class="notice-marker"><i v-if="!n.read" class="unread-dot" role="img" aria-label="未读" /></span>
            <button type="button" class="notice-main" @click.stop="activate(n, $event)">
              <span class="notice-head">
                <el-tag size="small" :type="TYPE_TAG[n.type] ?? 'info'" disable-transitions>
                  {{ NOTIFICATION_TYPE_LABEL[n.type] ?? n.type }}
                </el-tag>
                <span class="notice-title">{{ n.title }}</span>
              </span>
              <span v-if="n.content" class="notice-content pre-wrap">{{ n.content }}</span>
              <span class="notice-meta muted small" :title="fmtDateTime(n.createdAt, true)">
                <span>{{ fmtDateTime(n.createdAt) }}</span>
                <span>{{ fromNow(n.createdAt) }}</span>
              </span>
            </button>
            <div class="notice-actions" @click.stop @auxclick.stop>
              <el-button
                v-if="!n.read"
                link
                type="primary"
                :loading="busyId === n.id"
                @click.stop="markOne(n)"
              >
                标为已读
              </el-button>
              <span v-else class="muted small read-label">已读</span>
            </div>
          </li>
        </ul>
        <div v-if="total > 0" class="pager">
          <el-pagination
            :current-page="page"
            :page-size="size"
            :total="total"
            :page-sizes="[10, 20, 50]"
            :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
            :pager-count="isMobile ? 5 : 7"
            background
            size="small"
            @current-change="list.onPageChange"
            @size-change="list.onSizeChange"
          />
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.tabs :deep(.el-tabs__content) {
  display: none;
}
.tab-badge {
  margin-left: 4px;
  vertical-align: middle;
}
.tab-badge :deep(.el-badge__content) {
  position: static;
  transform: none;
}
.notice-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.notice-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 0 8px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  transition:
    background-color var(--eas-dur-fast) var(--eas-ease),
    box-shadow var(--eas-dur-fast) var(--eas-ease);
}
.notice-row:last-child {
  border-bottom: none;
}
.notice-row:hover,
.notice-row:focus-within {
  background: var(--eas-paper);
  box-shadow: inset 3px 0 0 var(--eas-primary);
}
.notice-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 0;
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  color: var(--el-text-color-regular);
  cursor: pointer;
  border-radius: var(--eas-radius-panel);
}
.notice-main:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.notice-head {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}
.notice-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
}
.notice-marker {
  width: 6px;
  flex: 0 0 6px;
  display: flex;
  align-items: center;
  height: 22px;
  margin-top: 14px;
}
.unread-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--eas-primary);
}
.notice-content {
  font-size: var(--eas-fs-sm);
  line-height: 1.6;
}
.notice-meta {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-variant-numeric: tabular-nums;
}
.notice-actions {
  flex-shrink: 0;
  padding-top: 14px;
  min-height: 32px;
  min-width: 64px;
  text-align: right;
}
.notice-actions .el-button {
  min-height: 32px;
  min-width: 32px;
}
/* “标为已读”默认透明，行悬停 / 行内聚焦时显示；触屏与窄屏常显 */
.notice-actions:has(.el-button) {
  opacity: 0;
  transition: opacity var(--eas-dur-fast) var(--eas-ease);
}
.notice-row:hover .notice-actions,
.notice-row:focus-within .notice-actions {
  opacity: 1;
}
@media (hover: none), (max-width: 768px) {
  .notice-actions:has(.el-button) {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .notice-row,
  .notice-actions:has(.el-button) {
    transition: none;
  }
}
@media (max-width: 768px) {
  .notice-row {
    flex-wrap: wrap;
    gap: 0 12px;
  }
  .notice-actions {
    width: 100%;
    padding: 0 0 12px 18px;
    box-sizing: border-box;
    text-align: left;
  }
  .notice-head {
    flex-wrap: wrap;
  }
  .notice-title {
    white-space: normal;
  }
}
</style>
