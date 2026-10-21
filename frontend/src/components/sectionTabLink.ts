// 栏目页签链接：在 我的待办 / 我的已办 之间切换时保留当前筛选（除分页 page），
// 恢复改版前 switchKind() 的行为；其余页签一律使用裸路径。
import type { LocationQuery, RouteLocationRaw } from 'vue-router'

const TASK_LIST_PATHS = new Set(['/tasks/pending', '/tasks/done'])

/**
 * 生成栏目页签的跳转目标。
 * 仅当当前页签与目标页签都是任务列表时，携带当前 query（去掉 page）。
 */
export function sectionTabLink(targetPath: string, activePath: string, query: LocationQuery): RouteLocationRaw {
  if (!TASK_LIST_PATHS.has(targetPath) || !TASK_LIST_PATHS.has(activePath)) return targetPath
  const { page: _page, ...rest } = query
  return { path: targetPath, query: rest }
}
