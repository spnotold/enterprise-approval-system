import { createSSRApp } from 'vue'
// #ifdef H5
// 展示字：数字和字母用 Fraunces（柔角），中文用思源宋体粗体（只加载 700 一档）。
// 都按 unicode-range 分片，浏览器只下载用到的字；小程序不打包字体，落到系统宋体。
import '@fontsource-variable/fraunces/soft.css'
import '@fontsource/noto-serif-sc/700.css'
// #endif
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  return { app }
}
