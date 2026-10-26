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
  width: calc(100% - 8rpx);
  white-space: nowrap;
  background: var(--eas-sheet);
  border-radius: var(--eas-radius-panel);
  box-shadow: var(--eas-shadow-sheet);
  margin: 0 8rpx 32rpx 0;
}

.steps-inner {
  display: flex;
  padding: 12rpx 4rpx;
}

.step {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 128rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--eas-ink-3);
  border-radius: var(--eas-radius-control);
}

.step::before {
  content: '';
  position: absolute;
  top: 40rpx;
  left: 50%;
  width: 100%;
  height: 4rpx;
  background: var(--eas-rule);
}

.step:last-child::before {
  display: none;
}

.step.done::before {
  background: var(--eas-sage);
}

.step-no {
  position: relative;
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  border-radius: 50%;
  text-align: center;
  background: var(--eas-tab);
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-md);
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  font-variant-numeric: tabular-nums;
  margin-bottom: 12rpx;
}

.step-name {
  position: relative;
  font-size: 24rpx;
}

.step.done .step-no {
  background: var(--eas-sage);
  color: var(--eas-ink);
}

.step.active {
  color: var(--eas-ink);
  font-weight: 600;
}

.step.active .step-no {
  background-color: var(--eas-ink);
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
  box-shadow: var(--eas-offset-mark);
}

.step-err {
  position: absolute;
  top: 8rpx;
  right: calc(50% - 38rpx);
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--eas-rust);
}
</style>
