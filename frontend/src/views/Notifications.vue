<script setup lang="ts">
// 通知中心：全部 / 未读分页列表；点击先标记已读再跳转；支持单条与全部标为已读
import { computed, nextTick, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
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
import IndexTabs from '@/components/IndexTabs.vue'
import ListEmpty from '@/components/ListEmpty.vue'
import type { NotificationItem } from '@/lib/types'
import '@/styles/listRows.css'

const router = useRouter()
const notice = useNoticeStore()
const { isMobile } = useBreakpoint()

const list = useListQuery<{ unreadOnly: boolean }, NotificationItem>({
  defaults: { unreadOnly: false },
  fetch: (q) => api.notifications.list(q),
})
const { filters, records, total, page, size, loading, loaded, error } = list

const tab = computed<string>({
  get: () => (filters.unreadOnly ? 'unread' : 'all'),
  set: (v: string) => {
    if ((v === 'unread') === filters.unreadOnly) return
    filters.unreadOnly = v === 'unread'
    void list.search()
  },
})
const tabs = computed(() => [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读', count: notice.unread },
])

const busyId = ref<number | null>(null)
const markingAll = ref(false)
const hasUnread = computed(() => notice.unread > 0 || records.value.some((n) => !n.read))
const tabContainer = ref<HTMLElement | null>(null)
const mainButtons = new Map<number, HTMLButtonElement>()

function setMainButton(id: number, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLButtonElement) mainButtons.set(id, el)
  else mainButtons.delete(id)
}

async function markOne(n: NotificationItem) {
  if (n.read || busyId.value !== null) return
  busyId.value = n.id
  let marked = false
  try {
    await notice.markRead(n.id)
    n.read = true
    marked = true
    // 未读列表中已读的条目不再属于当前筛选
    if (filters.unreadOnly) await list.load()
  } catch (e) {
    showError(e, '标记失败')
  } finally {
    busyId.value = null
  }
  if (!marked) return
  // 操作按钮消失后，将焦点留在通知行；若该行已移除，则回到当前页签。
  await nextTick()
  const main = mainButtons.get(n.id)
  if (main?.isConnected) main.focus({ preventScroll: true })
  else tabContainer.value?.querySelector<HTMLElement>('.index-tab.is-active')?.focus({ preventScroll: true })
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
  <div class="notice-page">
    <h2 class="eas-sr-only">通知中心</h2>
    <div ref="tabContainer" class="notice-tabs">
      <IndexTabs :items="tabs" :active="tab" label="通知筛选" @select="tab = $event">
        <template #actions>
          <div class="notice-tab-actions">
            <el-button :icon="Refresh" :loading="loading" aria-label="刷新" @click="list.load()"><span class="notice-btn-text">刷新</span></el-button>
            <el-button :loading="markingAll" :disabled="!hasUnread" @click="markAll">全部标为已读</el-button>
          </div>
        </template>
      </IndexTabs>
    </div>

    <div class="sheet notice-sheet">
      <el-result v-if="error" icon="warning" :title="errorText(error, '通知加载失败')">
        <template #extra><el-button type="primary" :loading="loading" @click="list.load()">重新加载</el-button></template>
      </el-result>
      <el-skeleton v-else-if="!loaded" class="notice-state" :rows="6" animated />
      <div v-else v-loading="loading">
        <ListEmpty
          v-if="!records.length"
          :description="filters.unreadOnly ? '没有未读通知' : '暂无通知'"
        >
          <template #action>
            <el-button v-if="filters.unreadOnly" @click="tab = 'all'">查看全部通知</el-button>
          </template>
        </ListEmpty>
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
            <span class="notice-type">{{ NOTIFICATION_TYPE_LABEL[n.type] ?? n.type }}</span>
            <button :ref="(el) => setMainButton(n.id, el)" type="button" class="notice-main" @click.stop="activate(n, $event)">
              <span class="notice-title">{{ n.title }}</span>
              <span v-if="n.content" class="notice-content pre-wrap">{{ n.content }}</span>
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
            </div>
            <span class="notice-time" :title="`${fmtDateTime(n.createdAt, true)}，${fromNow(n.createdAt)}`">{{ fmtDateTime(n.createdAt) }}</span>
          </li>
        </ul>
      </div>
      <div v-if="total > 0 && !error" class="pager">
        <el-pagination
          :current-page="page"
          :page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
          :pager-count="isMobile ? 5 : 7"
          @current-change="list.onPageChange"
          @size-change="list.onSizeChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 页签就是页面标题；选中的页签与下面的单据相接 */
.notice-tabs {
  position: relative;
  z-index: 1;
  margin-bottom: -1px;
}
.notice-tab-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.notice-sheet {
  border-top-left-radius: 0;
}
.notice-state {
  padding: 16px var(--eas-sheet-pad);
}
.notice-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.notice-row {
  display: grid;
  grid-template-columns: 6px 64px minmax(0, 1fr) auto 128px;
  align-items: start;
  column-gap: 12px;
  padding: 0 var(--eas-sheet-pad);
  cursor: pointer;
  border-bottom: 1px solid var(--eas-rule);
  transition:
    background-color var(--eas-dur-fast) var(--eas-ease),
    box-shadow var(--eas-dur-fast) var(--eas-ease);
}
.notice-row:last-child {
  border-bottom: 0;
}
.notice-row:hover,
.notice-row:focus-within {
  background: var(--eas-row-hover);
  box-shadow: inset 3px 0 0 var(--eas-primary);
}
.notice-marker {
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
.notice-type {
  justify-self: start;
  margin-top: 14px;
  padding: 0 6px;
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-tag);
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-xs);
  line-height: 20px;
  white-space: nowrap;
}
.notice-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  padding: 14px 0;
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  color: var(--eas-ink-2);
  cursor: pointer;
  border-radius: var(--eas-radius-control);
}
.notice-main:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.notice-title {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--eas-ink);
  line-height: 1.5;
}
.unread .notice-title {
  font-weight: 600;
}
.notice-content {
  font-size: var(--eas-fs-sm);
  line-height: 1.6;
}
.notice-time {
  margin-top: 14px;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.notice-actions {
  min-width: 80px;
  padding-top: 11px;
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
@media (max-width: 767px) {
  /* 窄屏页签行放不下按钮文字，刷新只留图标 */
  .notice-btn-text {
    display: none;
  }
  .notice-tab-actions .el-button {
    padding-left: 10px;
    padding-right: 10px;
  }
}
@media (max-width: 768px) {
  .notice-row {
    grid-template-columns: 6px auto minmax(0, 1fr);
    grid-template-areas:
      'marker type time'
      'marker main main'
      'marker actions actions';
    padding: 0 16px;
  }
  .notice-marker { grid-area: marker; }
  .notice-type { grid-area: type; }
  .notice-time { grid-area: time; }
  .notice-main { grid-area: main; padding: 6px 0 8px; }
  .notice-actions {
    grid-area: actions;
    padding: 0 0 8px;
    text-align: left;
  }
  .notice-title {
    white-space: normal;
  }
}
</style>
