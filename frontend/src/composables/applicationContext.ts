import { computed, inject, provide, shallowRef, type InjectionKey } from 'vue'

/** 路由页发布已读取的归属信息，外壳无需为导航再次读取正文。 */
export function createApplicationContext(currentId: () => number | undefined) {
  const loaded = shallowRef<{ id: number; applicantId: number }>()
  return {
    applicantId: computed(() => loaded.value?.id === currentId() ? loaded.value?.applicantId : undefined),
    publish(id: number, applicantId: number) {
      // 离开页面后才返回的请求不能覆盖当前页面的归属。
      if (id === currentId()) loaded.value = { id, applicantId }
    },
  }
}

type ApplicationContext = ReturnType<typeof createApplicationContext>
const KEY: InjectionKey<ApplicationContext> = Symbol('application-context')

export function provideApplicationContext(currentId: () => number | undefined) {
  const context = createApplicationContext(currentId)
  provide(KEY, context)
  return context
}

export function useApplicationContext() {
  return inject(KEY, null)
}
