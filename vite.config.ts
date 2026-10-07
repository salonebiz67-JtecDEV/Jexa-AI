import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Dynamically determine the base path for GitHub Pages and production:
  // 1. Explicit VITE_BASE_PATH environment variable (if user provided one)
  // 2. In GitHub Actions, GITHUB_REPOSITORY is automatically provided as "owner/repo"
  //    - If repo is "owner.github.io", it's a user/org page, so base is "/"
  //    - If repo is "my-project", base is "/my-project/"
  // 3. Fallback to "/" for dev server, or "./" for local production preview
  let base = '/';

  if (process.env.VITE_BASE_PATH) {
    let p = process.env.VITE_BASE_PATH.trim();
    if (!p.startsWith('/') && !p.startsWith('.')) {
      p = `/${p}`;
    }
    if (!p.endsWith('/')) {
      p = `${p}/`;
    }
    base = p;
  } else if (process.env.GITHUB_REPOSITORY) {
    const repo = process.env.GITHUB_REPOSITORY.split('/')[1] || '';
    if (repo && repo.toLowerCase().endsWith('.github.io')) {
      base = '/';
    } else if (repo) {
      base = `/${repo}/`;
    }
  } else {
    base = '/';
  }

  const isUrlConfigured = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_URL.trim());
  const isKeyConfigured = Boolean(process.env.VITE_SUPABASE_ANON_KEY && process.env.VITE_SUPABASE_ANON_KEY.trim());

  // Safe build-time diagnostic reporting (never print actual keys)
  console.log('-----------------------------------------');
  console.log('JEXA Build Diagnostics:');
  console.log(`Supabase URL configured: ${isUrlConfigured}`);
  console.log(`Supabase public key configured: ${isKeyConfigured}`);
  console.log('-----------------------------------------');

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: [
          'favicon.svg',
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: base,
          name: 'JEXA',
          short_name: 'JEXA',
          description: 'A modern AI assistant.',
          theme_color: '#07090e',
          background_color: '#07090e',
          display: 'standalone',
          orientation: 'any',
          start_url: base,
          scope: base,
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,woff,woff2}'],
          cleanupOutdatedCaches: true,
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ''),
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
    },
    server: {
      hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
    },
  };
});
