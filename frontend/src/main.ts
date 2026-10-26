import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// 展示字：Fraunces 只取柔角轴（数字、拉丁字母），中文标题用思源宋体粗体；都按 unicode-range 分片按需加载。
// 中文只加载 700 一档：标题写 400 / 600 时浏览器会就近取 700，不做假粗体。
import '@fontsource-variable/fraunces/soft.css'
import '@fontsource/noto-serif-sc/700.css'
import './styles/tokens.css'
import './styles/main.css'
import App from './App.vue'
import router from './router'

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app')
