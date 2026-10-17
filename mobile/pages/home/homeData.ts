import type { NotificationItem, PageResponse, PersonalStats, TaskItem, TemplateOption } from '@/lib/types'

export interface HomeState {
  stats: PersonalStats | null
  statsError: string
  statsLoading?: boolean

  notices: NotificationItem[]
  noticesError: string
  noticesLoading?: boolean

  templates: TemplateOption[]
  templatesError: string
  templatesLoading?: boolean

  pending: TaskItem[]
  pendingTotal?: number
  pendingError: string
  pendingLoading?: boolean
}

export function createInitialHomeState(): HomeState {
  return {
    stats: null,
    statsError: '',
    statsLoading: false,

    notices: [],
    noticesError: '',
    noticesLoading: false,

    templates: [],
    templatesError: '',
    templatesLoading: false,

    pending: [],
    pendingTotal: 0,
    pendingError: '',
    pendingLoading: false,
  }
}

export interface HomeApis {
  fetchStats?: () => Promise<PersonalStats>
  fetchNotices?: () => Promise<PageResponse<NotificationItem>>
  fetchTemplates?: () => Promise<TemplateOption[]>
  fetchPending?: () => Promise<PageResponse<TaskItem>>
}

export interface HomePermissions {
  adminOnly?: boolean
  canCreate?: boolean
  canHandle?: boolean
}

export function extractErrorMessage(err: unknown, fallback = '加载失败'): string {
  if (!err) return fallback
  if (typeof err === 'string') return err.trim() || fallback
  if (typeof err === 'object') {
    const e = err as { message?: string; errors?: Array<{ message?: string }> }
    if (e.message && typeof e.message === 'string') {
      return e.message.trim() || fallback
    }
    if (Array.isArray(e.errors) && e.errors[0]?.message) {
      return e.errors[0].message.trim() || fallback
    }
  }
  return fallback
}

export async function loadPendingSection(
  apis: HomeApis,
  state: HomeState,
  permissions: HomePermissions = {},
): Promise<void> {
  if (permissions.adminOnly || !permissions.canHandle) return
  if (!apis.fetchPending || state.pendingLoading) return
  state.pendingLoading = true
  try {
    const res = await apis.fetchPending()
    state.pending = res?.records ?? []
    state.pendingTotal = res?.total ?? 0
    state.pendingError = ''
  } catch (e) {
    state.pendingError = extractErrorMessage(e, '待办加载失败')
  } finally {
    state.pendingLoading = false
  }
}

export async function loadStatsSection(
  apis: HomeApis,
  state: HomeState,
  permissions: HomePermissions = {},
): Promise<void> {
  if (permissions.adminOnly) return
  if (!apis.fetchStats || state.statsLoading) return
  state.statsLoading = true
  try {
    const res = await apis.fetchStats()
    state.stats = res
    state.statsError = ''
  } catch (e) {
    state.statsError = extractErrorMessage(e, '统计加载失败')
  } finally {
    state.statsLoading = false
  }
}

export async function loadTemplatesSection(
  apis: HomeApis,
  state: HomeState,
  permissions: HomePermissions = {},
): Promise<void> {
  if (permissions.adminOnly || !permissions.canCreate) return
  if (!apis.fetchTemplates || state.templatesLoading) return
  state.templatesLoading = true
  try {
    const res = await apis.fetchTemplates()
    state.templates = res ?? []
    state.templatesError = ''
  } catch (e) {
    state.templatesError = extractErrorMessage(e, '模板加载失败')
  } finally {
    state.templatesLoading = false
  }
}

export async function loadNoticesSection(
  apis: HomeApis,
  state: HomeState,
): Promise<void> {
  if (!apis.fetchNotices || state.noticesLoading) return
  state.noticesLoading = true
  try {
    const res = await apis.fetchNotices()
    state.notices = res?.records ?? []
    state.noticesError = ''
  } catch (e) {
    state.noticesError = extractErrorMessage(e, '通知加载失败')
  } finally {
    state.noticesLoading = false
  }
}

export async function loadAllSections(
  apis: HomeApis,
  state: HomeState,
  permissions: HomePermissions = {},
): Promise<void> {
  await Promise.allSettled([
    loadPendingSection(apis, state, permissions),
    loadStatsSection(apis, state, permissions),
    loadTemplatesSection(apis, state, permissions),
    loadNoticesSection(apis, state),
  ])
}
