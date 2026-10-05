import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// base './' → ใช้ได้ทั้งที่ root ของ GitHub Pages และ path ย่อย (เช่น /Predis/)
export default defineConfig({
    base: './',
    plugins: [
        vue(),
        VitePWA({
            registerType: 'autoUpdate',
            filename: 'sw.js', // ชื่อเดียวกับ SW เดิม → เบราว์เซอร์อัปเดตแทนตัวเก่าอัตโนมัติ
            includeAssets: ['favicon.ico', 'icons/*.png', 'drug_list.json'],
            manifest: {
                name: 'Predispensing Error Recorder',
                short_name: 'Predis',
                description: 'บันทึกความคลาดเคลื่อนก่อนจ่ายยา',
                lang: 'th',
                start_url: './#/report',
                display: 'standalone',
                background_color: '#ffffff',
                theme_color: '#2563EB',
                icons: [
                    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
                ],
                shortcuts: [{ name: 'บันทึกรายงาน', url: './#/report' }]
            },
            workbox: {
                cleanupOutdatedCaches: true,
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}', 'drug_list.json'],
                maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
                navigateFallback: 'index.html',
                // หน้าเดิม (report.html ฯลฯ) เป็นหน้า redirect → ไม่ใช้ fallback
                navigateFallbackDenylist: [/\.html$/],
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
                        handler: 'CacheFirst',
                        options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 } }
                    }
                ]
            }
        })
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 800
    },
    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.js']
    }
});
