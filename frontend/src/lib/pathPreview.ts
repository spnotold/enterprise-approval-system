// 提交前的审批路径预览（确认框内容）；用 h() 构造，不使用 v-html
import { h, type VNode } from 'vue'
import type { PathPreview, PathPreviewNode } from './types'

function approverText(n: PathPreviewNode): string {
  const people = n.candidates?.length ? n.candidates : n.assignee ? [n.assignee] : []
  if (!people.length) return '待解析'
  return people.map((u) => `${u.realName}${u.deptName ? `（${u.deptName}）` : ''}`).join('、')
}

function modeSuffix(n: PathPreviewNode): string {
  if (n.mode === 'COUNTERSIGN') return '（会签）'
  if (n.mode === 'OR_SIGN') return '（或签）'
  return ''
}

export function pathPreviewMessage(p: PathPreview | null, intro = '提交后将按以下路径审批：'): VNode {
  if (!p) return h('p', { style: 'margin:0' }, '提交后将进入审批流程。')
  return h('div', [
    h('p', { style: 'margin:0 0 6px' }, intro),
    h(
      'ol',
      { style: 'margin:0;padding-left:20px;line-height:1.8' },
      p.nodes.map((n) =>
        h('li', { style: n.effective ? '' : 'color:var(--el-text-color-placeholder)' }, [
          `${n.name}${modeSuffix(n)}：`,
          n.effective ? approverText(n) : `跳过${n.conditionText ? `（条件不满足：${n.conditionText}）` : ''}`,
          n.resolveNote ? h('div', { style: 'font-size:12px;color:var(--el-text-color-secondary)' }, n.resolveNote) : null,
        ]),
      ),
    ),
    ...p.errors.map((e) => h('p', { style: 'margin:6px 0 0;color:var(--el-color-danger)' }, e)),
  ])
}
