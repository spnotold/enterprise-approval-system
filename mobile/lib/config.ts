// 接口地址。
// H5：与页面同源的 /api。开发时 manifest.json 中 h5.devServer 把 /api 代理到 localhost:8080，
//     部署时由 Nginx 转发（页面在 /m/ 下，接口仍是根路径的 /api）。
// 小程序：没有同源概念，必须用绝对地址。构建前设置环境变量 VITE_MP_API_BASE，
//     例如在 mobile/.env.local 中写 VITE_MP_API_BASE=https://eas.example.com/api
//     （正式发布需在小程序后台配置 HTTPS 合法域名；开发者工具中可勾选“不校验合法域名”）。

let base = '/api'
// #ifndef H5
base = import.meta.env.VITE_MP_API_BASE || 'http://localhost:8080/api'
// #endif

export const API_BASE: string = base.replace(/\/+$/, '')

/** 移动端标识：登录、刷新时后端据此在响应体中返回刷新令牌 */
export const CLIENT_HEADERS: Record<string, string> = { 'X-Client': 'mobile' }
