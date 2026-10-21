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
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
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
