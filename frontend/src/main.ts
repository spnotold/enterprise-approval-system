import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// 展示字：Fraunces 只取柔角轴（数字、拉丁字母），中文标题用站酷小薇；都按 unicode-range 分片按需加载
import '@fontsource-variable/fraunces/soft.css'
import '@fontsource/zcool-xiaowei/400.css'
import './styles/tokens.css'
import './styles/main.css'
import App from './App.vue'
import router from './router'

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app')
