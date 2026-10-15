import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import type { DeptOption, ExpenseTypeOption } from '@/lib/types'

// 字典数据：首次使用时加载，并发调用共享同一个请求
const inflight: Record<string, Promise<unknown> | undefined> = {}

function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const p = (inflight[key] as Promise<T> | undefined) ?? fn().finally(() => (inflight[key] = undefined))
  inflight[key] = p
  return p
}

export const useDictStore = defineStore('dict', {
  state: () => ({
    departments: [] as DeptOption[],
    departmentsLoaded: false,
    publicDepartments: [] as DeptOption[],
    publicDepartmentsLoaded: false,
    expenseTypes: [] as ExpenseTypeOption[],
    expenseTypesLoaded: false,
  }),
  getters: {
    deptName: (s) => (id: number | null | undefined) =>
      id == null ? '—' : (s.departments.find((d) => d.id === id)?.name ?? `#${id}`),
    expenseTypeName: (s) => (code: string | null | undefined) =>
      code ? (s.expenseTypes.find((t) => t.code === code)?.name ?? code) : '—',
  },
  actions: {
    async loadDepartments(force = false) {
      if (this.departmentsLoaded && !force) return this.departments
      return once('departments', async () => {
        this.departments = await api.dict.departments()
        this.departmentsLoaded = true
        return this.departments
      })
    },
    async loadPublicDepartments(force = false) {
      if (this.publicDepartmentsLoaded && !force) return this.publicDepartments
      return once('publicDepartments', async () => {
        this.publicDepartments = await api.dict.publicDepartments()
        this.publicDepartmentsLoaded = true
        return this.publicDepartments
      })
    },
    async loadExpenseTypes(force = false) {
      if (this.expenseTypesLoaded && !force) return this.expenseTypes
      return once('expenseTypes', async () => {
        this.expenseTypes = await api.dict.expenseTypes()
        this.expenseTypesLoaded = true
        return this.expenseTypes
      })
    },
    /** 管理端修改字典后调用，下次使用时重新加载 */
    invalidate(which: 'departments' | 'expenseTypes' | 'all' = 'all') {
      if (which === 'departments' || which === 'all') {
        this.departmentsLoaded = false
        this.publicDepartmentsLoaded = false
      }
      if (which === 'expenseTypes' || which === 'all') this.expenseTypesLoaded = false
    },
  },
})
