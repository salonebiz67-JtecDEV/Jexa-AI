import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

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
  } else if (mode === 'production') {
    base = './';
  }

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
