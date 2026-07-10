import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  build: {
    // O target legado por defeito do Vite (chrome87/safari14/...) já não é suportado
    // pelo esbuild 0.28 (ver overrides no package.json — fixa CVEs do esbuild 0.21
    // que o Vite 5 usaria por defeito). App interna, evergreen browsers apenas.
    target: 'es2022',
  },
  // optimizeDeps usa o seu próprio target esbuild (não herda de build.target) — precisa
  // do mesmo ajuste para o pre-bundling de dependências no dev server não falhar.
  optimizeDeps: {
    esbuildOptions: { target: 'es2022' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'PMPlan — Gestão de Manutenções Preventivas',
        short_name: 'PMPlan',
        description:
          'Planeamento e gestão de Manutenções Preventivas de Radioterapia e Braquiterapia',
        theme_color: '#3B82F6',
        background_color: '#111827',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Cache offline de dados recentes (secção 12) — não dados de negócio,
        // o Supabase continua a ser a fonte de verdade.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/date\.nager\.at\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nager-holidays-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
