import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Dynamically determine the base path for GitHub Pages and production:
  // 1. Explicit VITE_BASE_PATH environment variable (if user provided one)
  // 2. In GitHub Actions, GITHUB_REPOSITORY is automatically provided as "owner/repo"
  //    - If repo is "owner.github.io", it's a user/org page, so base is "/"
  //    - If repo is "my-project", base is "/my-project/"
  // 3. Fallback to "/" for dev server, or "./" for local production preview
  let base = '/';

  const basePath = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH;
  if (basePath) {
    let p = basePath.trim();
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

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  const isUrlConfigured = Boolean(supabaseUrl);
  const isKeyConfigured = Boolean(supabaseAnonKey);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const commitSha = process.env.GITHUB_SHA
    ? process.env.GITHUB_SHA.slice(0, 7)
    : 'dev';
  const buildId = `${dateStr}-build-${commitSha}`;
  const buildTime = now.toUTCString();

  // Safe build-time diagnostic reporting (never print actual keys)
  console.log('-----------------------------------------');
  console.log(`JEXA Build Diagnostics (${buildId}):`);
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
        injectRegister: null, // Managed cleanly by registerSW in src/main.tsx with controllerchange reload
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
          clientsClaim: true,
          skipWaiting: true,
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
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
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
