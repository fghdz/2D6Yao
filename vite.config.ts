/**
 * ─────────────────────────────────────────────────────────────
 * Fork 适配说明
 * ─────────────────────────────────────────────────────────────
 * 上游：https://github.com/kth2/2D6Yao
 * 本 Fork 仅新增 server 块用于宝塔/Nginx 自建部署，并禁用了开发环境下的 SW。
 * 其余配置（base、define、plugins、resolve）与上游完全一致。
 *
 * 注意：使用前请将下方的 'your-domain.com' 替换为你自己的实际域名。
 * 本 server 块仅对 vite dev 生效，不影响 GitHub Pages 的 build 产物。
 * ─────────────────────────────────────────────────────────────
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// GitHub Pages 把站点挂在 /<repo>/ 下，由部署工作流传入；本地开发仍是根路径。
const base = process.env.BASE_PATH ?? '/'

// 版本号写进每条断语：换了规则或模型之后，回测才分得清是哪一版断的。
const appVersion = `${(process.env.GITHUB_SHA ?? 'dev').slice(0, 7)}·${new Date().toISOString().slice(0, 10)}`

// https://vite.dev/config/
export default defineConfig({
  base,
  // ── Fork 新增：宝塔/Nginx 反代适配（仅 dev 生效）─────────────
  server: {
    // 允许通过自定义域名 / 内网穿透访问开发服务器，避免 Host 头被拦截。
    // ⚠️ 请替换为你自己的实际域名
    allowedHosts: ['your-domain.com'],
    // 外网 HTTPS 映射时，HMR 的 WebSocket 需要走 wss 并连到外部域名和端口。
    hmr: {
      host: 'your-domain.com',
      protocol: 'wss',
      clientPort: 443,
    },
  },
  // ── 以下与上游完全一致，除 PWA devOptions 外未作改动 ─────────
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // 【Fork 适配】开发环境下禁用 SW，避免旧的 Service Worker 缓存错误路径导致 404。
      devOptions: { enabled: false },
      manifest: {
        name: '六爻预测',
        short_name: '六爻',
        description: '传统六爻占卜排盘与解卦 PWA',
        lang: 'zh-CN',
        // 相对路径，这样挂在 /2D6Yao/ 子目录下也能正确安装。
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f4ecda',
        theme_color: '#b08d3f',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // 大字库（康熙笔画约 1.2MB、卦例库约 1.8MB）不进预缓存，用到才下载，用过再离线缓存。
        // 安装用的图标由浏览器在安装时抓取，装完系统自己留副本；logo.png 只是出图标的原稿，
        // 页面都不引用，所以一起排除，预缓存里只留界面真正要用的 mark.png。
        globIgnores: [
          '**/name-number-*.js',
          '**/cases-*.js',
          'logo.png',
          'pwa-*.png',
          'apple-touch-icon.png',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/name-number-.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'kangxi-strokes', expiration: { maxEntries: 2 } },
          },
          {
            urlPattern: /\/assets\/cases-.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'liuyao-cases', expiration: { maxEntries: 2 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
