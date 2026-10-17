<script setup lang="ts">
// 分步表单的步骤条：可点击切换，有错误的步骤标红点
defineProps<{
  steps: string[]
  current: number
  errorSteps?: number[]
}>()
const emit = defineEmits<{ change: [index: number] }>()
</script>

<template>
  <scroll-view scroll-x class="steps" :show-scrollbar="false">
    <view class="steps-inner">
      <view
        v-for="(s, i) in steps"
        :key="s"
        class="step"
        :class="{ active: i === current, done: i < current }"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="emit('change', i)"
      >
        <view class="step-no">{{ i + 1 }}</view>
        <text class="step-name">{{ s }}</text>
        <view v-if="errorSteps && errorSteps.includes(i)" class="step-err" />
      </view>
    </view>
  </scroll-view>
</template>

<style scoped>
.steps {
  width: 100%;
  white-space: nowrap;
  background: var(--eas-surface);
  border-radius: var(--eas-radius-panel);
  margin-bottom: 16rpx;
}

.steps-inner {
  display: flex;
  padding: 0 8rpx;
}

.step {
  position: relative;
  flex: 1;
  min-width: 136rpx;
  height: 112rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
  border-bottom: 4rpx solid transparent;
}

.step-no {
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  border-radius: 50%;
  text-align: center;
  background: var(--eas-paper);
  font-size: var(--eas-fs-xs);
  font-variant-numeric: tabular-nums;
  margin-bottom: 6rpx;
}

.step.done .step-no {
  background: var(--eas-primary-tint);
  color: var(--eas-primary);
}

.step.active {
  color: var(--eas-primary);
  font-weight: 600;
  border-bottom-color: var(--eas-primary);
}

.step.active .step-no {
  background: var(--eas-primary);
  color: var(--eas-surface);
}

.step-err {
  position: absolute;
  top: 16rpx;
  right: 28rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--eas-danger);
}
</style>
