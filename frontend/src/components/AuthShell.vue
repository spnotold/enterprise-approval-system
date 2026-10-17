<script setup lang="ts">
// 登录 / 注册共用外壳：左侧是安静的说明区（用一排签批格示意流转，窄屏隐藏），右侧是白底表单
import PaperField from '@/components/PaperField.vue'
</script>

<template>
  <div class="auth-page">
    <aside class="auth-aside">
      <PaperField class="auth-paper" base="deep" />
      <div class="aside-inner">
        <span class="logo" aria-hidden="true">审</span>
        <p class="aside-title">企业审批系统</p>
        <p class="aside-text">采购、差旅、报销等申请在线提交，按流程逐级审批，每一级的处理人、意见和时间都留在单据上。</p>
        <ol class="slip" aria-hidden="true">
          <li class="cell">
            <span class="cell-name">部门负责人</span>
            <span class="cell-state">已同意</span>
          </li>
          <li class="cell current">
            <span class="cell-name">财务审批</span>
            <span class="cell-state">处理中</span>
          </li>
          <li class="cell">
            <span class="cell-name">企业负责人</span>
            <span class="cell-state">待流转</span>
          </li>
        </ol>
      </div>
    </aside>

    <main class="auth-main">
      <div class="auth-box">
        <div class="brand-compact">
          <span class="logo" aria-hidden="true">审</span>
          <span class="brand-name">企业审批系统</span>
        </div>
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 540px);
  min-height: 100%;
  background: var(--eas-surface);
}
.auth-aside {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: var(--eas-paper-deep);
  border-right: 1px solid var(--eas-rule);
}
.auth-paper {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}
.aside-inner {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
}
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  border: 1.5px solid var(--eas-primary);
  border-radius: 3px;
  color: var(--eas-primary);
  font-family: var(--eas-font-serif);
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
}
.aside-title {
  margin: 20px 0 12px;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-xl);
  font-weight: 600;
  line-height: 1.3;
}
.aside-text {
  margin: 0;
  color: var(--eas-ink-2);
  line-height: 1.8;
}

/* 签批格示意：已办实线、当前虚线、未到留空 */
.slip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 32px 0 0;
  padding: 0;
  list-style: none;
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: var(--eas-surface);
  border: 1px solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-tag);
}
.cell.current {
  background: var(--eas-primary-tint);
  border: 1px dashed var(--eas-primary);
}
.cell-name {
  font-size: var(--eas-fs-sm);
  font-weight: 500;
}
.cell-state {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}
.cell.current .cell-state {
  color: var(--eas-primary);
}

.auth-main {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 40px;
  box-sizing: border-box;
}
.auth-box {
  width: 100%;
  max-width: 400px;
}
.brand-compact {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}
.brand-compact .logo {
  width: 28px;
  height: 28px;
  font-size: var(--eas-fs-md);
}
.brand-name {
  font-size: var(--eas-fs-md);
  font-weight: 600;
}

@media (max-width: 880px) {
  .auth-page {
    grid-template-columns: minmax(0, 1fr);
  }
  .auth-aside {
    display: none;
  }
  .auth-main {
    align-items: flex-start;
    padding: 32px 20px;
  }
  .brand-compact {
    display: flex;
  }
}
</style>
