// 外壳（Layout）仅在当前栏目有 ≥2 个可见页面时渲染页签行并提供 #section-actions 目标。
// 同一组件实例会被同栏目的多个列表复用（如 我的申请 / 本部门申请 / 授权范围申请），
// 切换栏目后目标节点可能出现或消失，因此每次路由渲染后都要重新探测，
// 否则 Teleport 会把页面操作传送到已卸载的目标里（操作消失）或一直留在工具栏。
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

/** 是否存在 #section-actions 传送目标；随路由切换后外壳的重渲染而更新。 */
export function useSectionActionsTarget() {
  const route = useRoute()
  const hasTarget = ref(false)
  const detect = () => {
    hasTarget.value = document.getElementById('section-actions') !== null
  }
  onMounted(detect)
  // flush: 'post' 保证在外壳按新路由重渲染（挂载/卸载页签行）之后再探测。
  watch(() => route.path, detect, { flush: 'post' })
  return hasTarget
}
