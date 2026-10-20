import type { MenuSection } from './menu'

const FROM_PATHS: Record<string, string> = {
  pending: '/tasks/pending',
  done: '/tasks/done',
  mine: '/applications/mine',
  dept: '/dept/applications',
  granted: '/applications/granted',
}

/** 只接受可见栏目 / 列表的来源，忽略过期或无权限的 history/query 提示。 */
export function detailSectionHint(
  sources: unknown[],
  sections: readonly MenuSection[],
  applicantId?: number,
  currentUserId?: number,
): string | undefined {
  const contexts = sections.filter((section) => section.id === 'application' || section.id === 'approval')
  for (const source of sources) {
    if (typeof source !== 'string') continue
    const path = (FROM_PATHS[source] ?? source).split(/[?#]/)[0]
    const section = contexts.find((section) => section.id === path || section.items.some((item) => item.path === path))
    if (section) return section.id
  }
  if (applicantId == null || currentUserId == null) return undefined
  const fallback = applicantId === currentUserId ? 'application' : 'approval'
  return contexts.find((section) => section.id === fallback)?.id
}
