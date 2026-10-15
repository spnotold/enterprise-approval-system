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
  background: #fff;
  border-radius: 16rpx;
  margin-bottom: 24rpx;
}

.steps-inner {
  display: flex;
  padding: 0 8rpx;
}

.step {
  position: relative;
  flex: 1;
  min-width: 110rpx;
  height: 112rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8f959e;
  font-size: 22rpx;
}

.step-no {
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  border-radius: 50%;
  text-align: center;
  background: #eef0f3;
  font-size: 22rpx;
  margin-bottom: 6rpx;
}

.step.done .step-no {
  background: #e8efff;
  color: #2f6bff;
}

.step.active {
  color: #2f6bff;
  font-weight: 600;
}

.step.active .step-no {
  background: #2f6bff;
  color: #fff;
}

.step-err {
  position: absolute;
  top: 16rpx;
  right: 22rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #e5484d;
}
</style>
