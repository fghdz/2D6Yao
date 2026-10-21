declare const __APP_VERSION__: string | undefined

/** 构建时注入（提交号·日期）；单元测试等没经过 Vite 的场合为 dev。 */
export const appVersion: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
