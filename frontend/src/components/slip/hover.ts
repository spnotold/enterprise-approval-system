// 签批栏与流转记录的悬停联动：两处共享当前悬停（或键盘聚焦）的节点。
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'

export type SlipHoverSource = 'bar' | 'flow'

export interface SlipHover {
  /** 当前悬停的节点 key（FlowNodeView.seq 的字符串形式） */
  key: Ref<string | null>
  /** 悬停发生在签批栏还是流转记录；只有签批栏悬停时弹出审批意见 */
  source: Ref<SlipHoverSource | null>
  enter: (key: string, source: SlipHoverSource) => void
  leave: (key: string) => void
}

const KEY: InjectionKey<SlipHover> = Symbol('slip-hover')

function createSlipHover(): SlipHover {
  const key = ref<string | null>(null)
  const source = ref<SlipHoverSource | null>(null)
  return {
    key,
    source,
    enter(k, s) {
      key.value = k
      source.value = s
    },
    leave(k) {
      if (key.value !== k) return
      key.value = null
      source.value = null
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
