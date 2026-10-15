import type { AppType } from '@/lib/types'
import { formPagePath } from './labels'

export const LOGIN_PAGE = '/pages/login/index'
export const HOME_PAGE = '/pages/home/index'

export const TAB_PAGES = [
  '/pages/home/index',
  '/pages/apply/index',
  '/pages/task/list',
  '/pages/notice/list',
  '/pages/me/index',
]

/** “消息” tab 的下标，用于角标 */
export const NOTICE_TAB_INDEX = 3

function query(params: Record<string, string | number | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

/** 页面栈过深时（小程序上限 10 层）改用 redirectTo，避免跳转失败 */
export function go(url: string, replace = false): void {
  const path = url.split('?')[0]
  if (TAB_PAGES.includes(path)) {
    uni.switchTab({ url: path })
    return
  }
  if (replace || getCurrentPages().length >= 9) uni.redirectTo({ url })
  else uni.navigateTo({ url })
}

export function goDetail(id: number, replace = false): void {
  go(`/pages/app/detail${query({ id })}`, replace)
}

export function goTaskHandle(taskId: number, appId: number): void {
  go(`/pages/task/handle${query({ taskId, id: appId })}`)
}

export function goForm(
  type: AppType,
  opts: { id?: number | null; templateId?: number | null } = {},
  replace = false,
): void {
  go(`${formPagePath(type)}${query({ id: opts.id, templateId: opts.templateId })}`, replace)
}

export function goAppList(filters: { status?: string; type?: string; scope?: string } = {}): void {
  go(`/pages/app/list${query(filters)}`)
}

/** 当前页面的完整地址（含参数），登录后据此返回 */
export function currentUrl(): string {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1] as (Page.PageInstance & { options?: Record<string, string> }) | undefined
  if (!page?.route) return ''
  const opts = page.options ?? {}
  return `/${page.route}${query(opts)}`
}

export function goLogin(redirect?: string): void {
  const url = `${LOGIN_PAGE}${query({ redirect })}`
  uni.reLaunch({ url })
}

/**
 * 通知跳转：优先按 applicationId 打开详情；否则把 Web 端 linkPath 映射到移动端页面。
 * 示例 linkPath：/applications/305、/tasks/pending
 */
export function openLink(n: { applicationId: number | null; linkPath: string | null }): void {
  if (n.applicationId) {
    goDetail(n.applicationId)
    return
  }
  const p = n.linkPath ?? ''
  const m = /^\/applications\/(\d+)/.exec(p)
  if (m) {
    goDetail(Number(m[1]))
    return
  }
  if (p.startsWith('/tasks')) {
    uni.switchTab({ url: '/pages/task/list' })
    return
  }
  if (p.startsWith('/profile')) {
    uni.switchTab({ url: '/pages/me/index' })
  }
}
