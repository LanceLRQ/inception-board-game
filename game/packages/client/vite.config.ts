import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { buildThemeBootScript } from './src/theme/bootScript';
import { DEFAULT_THEME_ID, THEMES } from './src/theme/themes';

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
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
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
