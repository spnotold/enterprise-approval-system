// 字典数据（费用类型等），首次使用时加载并缓存。
import { reactive } from 'vue'
import { api } from '@/lib/api'
import type { ExpenseTypeOption } from '@/lib/types'

const state = reactive({
  expenseTypes: [] as ExpenseTypeOption[],
})

let expenseLoading: Promise<ExpenseTypeOption[]> | null = null

export const dict = {
  state,

  /** 启用的费用类型 */
  loadExpenseTypes(force = false): Promise<ExpenseTypeOption[]> {
    if (state.expenseTypes.length && !force) return Promise.resolve(state.expenseTypes)
    if (!expenseLoading) {
      expenseLoading = api.dict
        .expenseTypes()
        .then((list) => {
          state.expenseTypes = list.filter((t) => t.enabled !== false)
          return state.expenseTypes
        })
        .finally(() => {
          expenseLoading = null
        })
    }
    return expenseLoading
  },

  expenseTypeName(code: string | null | undefined): string {
    if (!code) return ''
    return state.expenseTypes.find((t) => t.code === code)?.name ?? code
  },

  clear(): void {
    state.expenseTypes = []
  },
}
