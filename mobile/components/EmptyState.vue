<script setup lang="ts">
// 空结果：圆形插画（背后芥黄错版圆）+ 一句说明 + 可选的按钮。
// 普通空列表用 empty-tray，筛选后无结果用 kind="search"（empty-search）；
// 加载中、出错这类不是「空」的提示传 kind="none"，只显示文字和按钮。
withDefaults(
  defineProps<{
    text?: string
    actionText?: string
    kind?: 'tray' | 'search' | 'none'
  }>(),
  { text: '', actionText: '', kind: 'tray' },
)
const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <view class="empty" :class="{ 'empty--plain': kind === 'none' }">
    <view v-if="kind !== 'none'" class="pic">
      <image class="pic-img" :src="`/static/illustrations/empty-${kind}.jpg`" mode="aspectFill" />
    </view>
    <view class="empty-text">{{ text || '暂无数据' }}</view>
    <view v-if="actionText" class="btn empty-action" hover-class="is-pressed" hover-stay-time="60" @tap="emit('action')">{{ actionText }}</view>
  </view>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56rpx 32rpx 48rpx;
}

.empty--plain {
  padding-top: 40rpx;
}

/* 圆形插画，后面错开垫一块芥黄圆 */
.pic {
  width: 280rpx;
  height: 280rpx;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 10rpx 10rpx 0 var(--eas-mustard);
  margin-bottom: 36rpx;
}

.pic-img {
  display: block;
  width: 100%;
  height: 100%;
}

.empty-text {
  max-width: 520rpx;
  text-align: center;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-md);
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  line-height: 1.5;
  color: var(--eas-ink);
}

.empty--plain .empty-text {
  font-family: var(--eas-font-sans);
  font-size: var(--eas-fs-sm);
  font-weight: 400;
  color: var(--eas-ink-2);
}

.empty-action {
  margin-top: 32rpx;
  min-width: 240rpx;
}
</style>
