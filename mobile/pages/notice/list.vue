<script setup lang="ts">
// 消息：全部 / 未读，标记已读；点击先标记已读，再跳转到关联的申请
import { computed, ref } from 'vue'
import { onLoad, onPageScroll, onHide, onPullDownRefresh, onReachBottom, onShow, onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import type { NotificationItem } from '@/lib/types'
import SwipeCell from '@/components/SwipeCell.vue'
import { closeSwipeCells } from '@/composables/useSwipeTabs'
import EmptyState from '@/components/EmptyState.vue'
import { usePagedList } from '@/composables/usePagedList'
import { requireLogin } from '@/stores/auth'
import { NOTICE_EVENT, notice } from '@/stores/notice'
import { confirm, showError, toast } from '@/utils/feedback'
import { NOTICE_TYPE_LABEL } from '@/utils/labels'
import { openLink } from '@/utils/nav'
import { fmtShort } from '@/utils/time'

const unreadOnly = ref(false)
const ready = ref(false)
const unread = computed(() => notice.state.unread)

const list = usePagedList<NotificationItem>(async (page, size) => {
  const r = await api.notifications.list({ page, size, unreadOnly: unreadOnly.value })
  notice.markSeen(r.records.map((x) => x.id))
  return r
}, 15)

function reload(): void {
  closeSwipeCells()
  void list.reload()
}

function setTab(v: boolean): void {
  if (unreadOnly.value === v) return
  unreadOnly.value = v
  reload()
}

async function tap(n: NotificationItem): Promise<void> {
  if (!n.read) {
    try {
      await api.notifications.markRead(n.id)
      n.read = true
      notice.decrease()
      list.items.value = [...list.items.value]
    } catch (e) {
      showError(e)
    }
  }
  openLink(n)
}

async function markRead(n: NotificationItem): Promise<void> {
  if (n.read) return
  try {
    await api.notifications.markRead(n.id)
    n.read = true
    notice.decrease()
    toast('已标记为已读', 'success')
    reload()
  } catch (e) { showError(e) }
}
onPageScroll(closeSwipeCells)
onHide(closeSwipeCells)

async function readAll(): Promise<void> {
  if (!unread.value) return
  if (!(await confirm({ content: '将全部消息标记为已读？' }))) return
  try {
    await api.notifications.markAllRead()
    notice.setUnread(0)
    toast('已全部标记为已读', 'success')
    reload()
  } catch (e) {
    showError(e)
  }
}

const onNotice = () => reload()

onLoad(async () => {
  if (!(await requireLogin())) return
  ready.value = true
  uni.$on(NOTICE_EVENT, onNotice)
  reload()
})

onShow(() => {
  notice.applyBadge()
  if (ready.value && list.loaded.value) reload()
})

onUnload(() => uni.$off(NOTICE_EVENT, onNotice))
onPullDownRefresh(() => reload())
onReachBottom(() => void list.loadMore())
</script>

<template>
  <view class="page" @tap="closeSwipeCells">
    <view class="row">
      <view class="seg flex1">
        <view class="seg-indicator" :style="{ width: 'calc((100% - 12rpx) / 2)', transform: `translateX(${unreadOnly ? 100 : 0}%)` }" />
        <view class="seg-item" :class="{ active: !unreadOnly }" hover-class="is-pressed" hover-stay-time="60" @tap="setTab(false)">全部</view>
        <view class="seg-item" :class="{ active: unreadOnly }" hover-class="is-pressed" hover-stay-time="60" @tap="setTab(true)">
          <text>未读<text v-if="unread">（{{ unread > 99 ? '99+' : unread }}）</text></text>
        </view>
      </view>
      <view class="link-btn read-all" :class="{ disabled: !unread }" hover-class="is-pressed" hover-stay-time="60" @tap="readAll">全部已读</view>
    </view>

    <SwipeCell v-for="n in list.items.value" :key="n.id" :cell-id="`notice-${n.id}`" :actions="n.read ? [] : [{ key: 'read', text: '标为已读', type: 'primary' }]" @content-tap="tap(n)" @action="markRead(n)">
      <view class="card notice" hover-class="is-pressed" hover-stay-time="60">
        <view class="row">
          <text class="tag" :class="{ 'tag-red': n.type === 'APP_REJECTED' || n.type === 'TASK_OVERDUE' }">
            {{ NOTICE_TYPE_LABEL[n.type] ?? '通知' }}
          </text>
          <view v-if="!n.read" class="dot" />
          <text class="title ellipsis" :class="{ unread: !n.read }">{{ n.title }}</text>
        </view>
        <view v-if="n.content" class="muted content break">{{ n.content }}</view>
        <view class="muted time">{{ fmtShort(n.createdAt) }}</view>
      </view>
    </SwipeCell>

    <EmptyState v-if="list.loaded.value && !list.items.value.length" :text="unreadOnly ? '没有未读消息' : '暂无消息'" />
    <uni-load-more v-else-if="list.items.value.length" :status="list.moreStatus.value" :content-text="{ contentdown: '上拉加载更多', contentrefresh: '加载中', contentnomore: '没有更多记录' }" />
  </view>
</template>

<style scoped>
/* 嵌在 SwipeCell 里：间距和纸影都由外层负责 */
.notice { margin: 0; }

/* 与 .seg 的 32rpx 下边距对齐：行内两个盒子的内容中线才等高（全部已读不低一头） */
.read-all {
  margin: 0 0 32rpx 12rpx;
}

.read-all.disabled {
  color: var(--eas-ink-3);
}

/* 未读标记：铁锈圆点，放在标题前 */
.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: var(--eas-rust);
  margin-right: 10rpx;
  flex-shrink: 0;
}

.title {
  flex: 1;
  min-width: 0;
  color: var(--eas-ink-2);
}

.title.unread {
  font-weight: 600;
  color: var(--eas-ink);
}

.content {
  margin: 10rpx 0 0;
}

.time {
  margin-top: 10rpx;
}
</style>
