<script setup lang="ts">
// 底部弹出面板（驳回理由、同行人员选择等），底部留出安全区
defineProps<{
  visible: boolean
  title?: string
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <view v-if="visible" class="sheet-mask" @tap="emit('close')">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <text class="sheet-title">{{ title }}</text>
        <view class="sheet-close" @tap="emit('close')">
          <uni-icons type="closeempty" size="22" color="#8f959e" />
        </view>
      </view>
      <scroll-view scroll-y class="sheet-body">
        <slot />
      </scroll-view>
      <view class="sheet-foot">
        <slot name="footer" />
      </view>
    </view>
  </view>
</template>

<style scoped>
.sheet-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet {
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 8rpx 8rpx 32rpx;
  border-bottom: 1rpx solid #f0f1f2;
}

.sheet-title {
  font-size: 32rpx;
  font-weight: 600;
}

.sheet-close {
  width: 88rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet-body {
  max-height: 60vh;
  padding: 24rpx 32rpx;
  box-sizing: border-box;
}

.sheet-foot {
  padding: 16rpx 32rpx 24rpx;
}
</style>
