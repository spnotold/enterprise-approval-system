<script setup lang="ts">
// 消息：全部 / 未读，标记已读；点击先标记已读，再跳转到关联的申请
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onReachBottom, onShow, onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import type { NotificationItem } from '@/lib/types'
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
  <view class="page">
    <view class="row">
      <view class="seg flex1">
        <view class="seg-item" :class="{ active: !unreadOnly }" @tap="setTab(false)">全部</view>
        <view class="seg-item" :class="{ active: unreadOnly }" @tap="setTab(true)">
          未读<text v-if="unread">（{{ unread > 99 ? '99+' : unread }}）</text>
        </view>
      </view>
      <view class="link-btn read-all" :class="{ disabled: !unread }" @tap="readAll">全部已读</view>
    </view>

    <view v-for="n in list.items.value" :key="n.id" class="card notice" @tap="tap(n)">
      <view class="row between">
        <view class="row flex1">
          <view v-if="!n.read" class="dot" />
          <text class="tag" :class="n.type === 'APP_REJECTED' || n.type === 'TASK_OVERDUE' ? 'tag-red' : 'tag-blue'">
            {{ NOTICE_TYPE_LABEL[n.type] ?? '通知' }}
          </text>
          <text class="ellipsis" :class="{ bold: !n.read }">{{ n.title }}</text>
        </view>
      </view>
      <view v-if="n.content" class="muted content break">{{ n.content }}</view>
      <view class="muted">{{ fmtShort(n.createdAt) }}</view>
    </view>

    <EmptyState v-if="list.loaded.value && !list.items.value.length" :text="unreadOnly ? '没有未读消息' : '暂无消息'" />
    <uni-load-more v-else-if="list.items.value.length" :status="list.moreStatus.value" />
  </view>
</template>

<style scoped>
.read-all {
  margin: 0 0 24rpx 12rpx;
}

.read-all.disabled {
  color: #c0c4cc;
}

.dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #e5484d;
  margin-right: 10rpx;
  flex-shrink: 0;
}

.content {
  margin: 8rpx 0;
}
</style>
