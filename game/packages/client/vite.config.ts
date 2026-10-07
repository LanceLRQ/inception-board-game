import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { buildThemeBootScript } from './src/theme/bootScript';
import { DEFAULT_THEME_ID, THEMES } from './src/theme/themes';
import { CARD_ART_CACHE_NAME, CARD_ART_URL_PATTERN } from './src/lib/cardArtRoute';

/** 把首屏主题脚本注入到 <head> 最前面，让主题属性在首次绘制之前就位 */
function themeBootPlugin(): Plugin {
  return {
    name: 'icgame-theme-boot',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          children: buildThemeBootScript(),
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

const defaultThemeColor = THEMES[DEFAULT_THEME_ID].themeColor;

export default defineConfig({
  plugins: [
    themeBootPlugin(),
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: '盗梦都市 · Inception City Online',
        short_name: '盗梦都市',
        description: '移动端优先的桌游《盗梦都市》在线多人复刻',
        theme_color: defaultThemeColor,
        background_color: defaultThemeColor,
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 离线人机模式：缓存 app shell + 静态资源
        runtimeCaching: [
          {
            // 卡图（约 100 张、十几 MB）不进预缓存：用到哪张缓存哪张，下次（含离线）直接取缓存。
            // 必须排在通用图片规则之前：Workbox 取第一条匹配的规则。
            // 卡图地址带内容哈希作版本参数（?v=...）：路由只看路径所以照样命中，缓存的键是完整地址，
            // 图换了哈希就变、旧图自动失效。匹配器会被 toString() 写进 Service Worker，
            // 所以用正则字面量而不是引用别处标识符的函数（见 src/lib/cardArtRoute.ts）
            urlPattern: CARD_ART_URL_PATTERN,
            handler: 'CacheFirst',
            options: {
              cacheName: CARD_ART_CACHE_NAME,
              // 全部卡图 + 背面不到 120 张；留出余量，超出时淘汰最久没用的
              expiration: { maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // 字体分片有两百多个文件，不进预缓存：用到哪片缓存哪片
            urlPattern: /\.woff2?$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // 楷体样式表：用过一次之后离线也能用
            urlPattern: /lxgwwenkai[^/]*\.css$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-css-cache',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        // 「庄周梦蝶」的楷体样式（按字符集分片的 @font-face 声明）只在用到这个主题时才取，不进预缓存
        // 卡图也不进预缓存（见上面的运行时缓存规则）
        globIgnores: ['**/lxgwwenkai*.css', 'cards/**'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
