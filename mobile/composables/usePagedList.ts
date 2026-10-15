// 分页列表：下拉刷新（onPullDownRefresh）+ 触底加载（onReachBottom）。
import { computed, ref, shallowRef } from 'vue'
import type { PageResponse } from '@/lib/types'
import { showError } from '@/utils/feedback'

export function usePagedList<T>(fetcher: (page: number, size: number) => Promise<PageResponse<T>>, size = 10) {
  const items = shallowRef<T[]>([])
  const page = ref(0)
  const total = ref(0)
  const loading = ref(false)
  const finished = ref(false)
  const loaded = ref(false)
  const failed = ref(false)
  let seq = 0

  async function fetchPage(target: number, replace: boolean): Promise<void> {
    const my = ++seq
    loading.value = true
    failed.value = false
    try {
      const r = await fetcher(target, size)
      if (my !== seq) return // 已有更新的请求
      items.value = replace ? r.records : [...items.value, ...r.records]
      page.value = r.page || target
      total.value = r.total
      finished.value = items.value.length >= r.total || r.records.length < size
      loaded.value = true
    } catch (e) {
      if (my !== seq) return
      failed.value = true
      showError(e)
    } finally {
      if (my === seq) loading.value = false
    }
  }

  /** 重新加载第一页 */
  async function reload(): Promise<void> {
    finished.value = false
    await fetchPage(1, true)
    uni.stopPullDownRefresh()
  }

  async function loadMore(): Promise<void> {
    if (loading.value || finished.value) return
    await fetchPage(page.value + 1, false)
  }

  /** 供 uni-load-more 使用 */
  const moreStatus = computed(() => (loading.value ? 'loading' : finished.value ? 'noMore' : 'more'))

  return { items, page, total, loading, finished, loaded, failed, reload, loadMore, moreStatus }
}
