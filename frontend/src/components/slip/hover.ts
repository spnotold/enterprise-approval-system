// 签批栏与流转记录的悬停联动：两处共享当前悬停（或键盘聚焦）的节点。
// 鼠标与焦点分开记录，有效值 = 鼠标 ?? 焦点：移开鼠标时回落到仍有焦点的格子，而不是清空。
import { computed, inject, provide, ref, type ComputedRef, type InjectionKey } from 'vue'

export type SlipHoverSource = 'bar' | 'flow'
export type SlipHoverVia = 'pointer' | 'focus'

interface Target {
  key: string
  source: SlipHoverSource
}

export interface SlipHover {
  /** 当前联动的节点 key（FlowNodeView.seq 的字符串形式） */
  key: ComputedRef<string | null>
  /** 联动发生在签批栏还是流转记录；只有签批栏时弹出审批意见 */
  source: ComputedRef<SlipHoverSource | null>
  enter: (key: string, source: SlipHoverSource, via: SlipHoverVia) => void
  leave: (key: string, via: SlipHoverVia) => void
  /** 某一处内容卸载或节点消失时清掉它留下的状态（被移除的元素不会触发 blur / mouseleave） */
  release: (source: SlipHoverSource, keep?: (key: string) => boolean) => void
}

const KEY: InjectionKey<SlipHover> = Symbol('slip-hover')
/** 鼠标离开后的宽限：从格子移到它的意见浮层，中间隔着几像素空隙 */
const POINTER_GRACE_MS = 120

export function createSlipHover(): SlipHover {
  const pointer = ref<Target | null>(null)
  const focus = ref<Target | null>(null)
  const effective = computed(() => pointer.value ?? focus.value)
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancelLeave() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  return {
    key: computed(() => effective.value?.key ?? null),
    source: computed(() => effective.value?.source ?? null),
    enter(key, source, via) {
      if (via === 'pointer') {
        cancelLeave()
        pointer.value = { key, source }
      } else {
        focus.value = { key, source }
      }
    },
    leave(key, via) {
      if (via === 'focus') {
        if (focus.value?.key === key) focus.value = null
        return
      }
      if (pointer.value?.key !== key) return
      cancelLeave()
      timer = setTimeout(() => {
        timer = undefined
        if (pointer.value?.key === key) pointer.value = null
      }, POINTER_GRACE_MS)
    },
    release(source, keep = () => false) {
      if (pointer.value?.source === source && !keep(pointer.value.key)) {
        cancelLeave()
        pointer.value = null
      }
      if (focus.value?.source === source && !keep(focus.value.key)) focus.value = null
    },
  }
}

export function provideSlipHover(): SlipHover {
  const hover = createSlipHover()
  provide(KEY, hover)
  return hover
}

/** 没有上层提供时退化为组件内部状态，组件单独使用也能工作 */
export function useSlipHover(): SlipHover {
  return inject(KEY, createSlipHover, true)
}

export const nodeKeyOf = (node: { seq: number }) => String(node.seq)
