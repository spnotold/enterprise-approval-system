// 判断窗口是否为移动端宽度
import { onBeforeUnmount, onMounted, ref } from 'vue'

export const MOBILE_QUERY = '(max-width: 768px)'

export function useBreakpoint(query: string = MOBILE_QUERY) {
  const mql = typeof window !== 'undefined' ? window.matchMedia(query) : null
  const isMobile = ref(mql?.matches ?? false)
  const update = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
  onMounted(() => mql?.addEventListener('change', update))
  onBeforeUnmount(() => mql?.removeEventListener('change', update))
  return { isMobile }
}
