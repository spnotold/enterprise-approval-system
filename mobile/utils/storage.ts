// 令牌存储：H5 用 sessionStorage（关闭标签页即失效）；小程序用 uni.setStorageSync。

export function getItem(key: string): string | null {
  // #ifdef H5
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
  // #endif
  // #ifndef H5
  const v = uni.getStorageSync(key)
  return typeof v === 'string' && v ? v : null
  // #endif
}

export function setItem(key: string, value: string | null): void {
  // #ifdef H5
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    // 隐私模式等禁用存储时忽略，令牌只保存在内存中
  }
  // #endif
  // #ifndef H5
  if (value) uni.setStorageSync(key, value)
  else uni.removeStorageSync(key)
  // #endif
}
