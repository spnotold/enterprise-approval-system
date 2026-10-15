/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 小程序访问后端的绝对地址，如 https://eas.example.com/api（见 lib/config.ts） */
  readonly VITE_MP_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** 微信小程序全局对象（仅在 #ifdef MP-WEIXIN 中使用） */
interface WxChooseMessageFileResult {
  tempFiles: { path: string; size: number; name: string; type: string; time?: number }[]
}
declare const wx: {
  chooseMessageFile(options: {
    count: number
    type?: 'all' | 'video' | 'image' | 'file'
    extension?: string[]
    success?: (res: WxChooseMessageFileResult) => void
    fail?: (err: { errMsg: string }) => void
  }): void
}

declare module '@qiun/ucharts' {
  // uCharts 没有类型声明，只在 components/UChart.vue 中使用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uCharts: any
  export default uCharts
}
