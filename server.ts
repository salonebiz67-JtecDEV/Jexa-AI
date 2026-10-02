import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import apiRoutes from './backend/src/routes/api.routes';
import { errorHandler } from './backend/src/middleware/error.middleware';
import { isSupabaseConfigured } from './backend/src/database/supabase';

// Load environment variables
dotenv.config();

// ESM-compatible path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Default to 10000 on Render/production, or 3000 in local dev environment
const PORT = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 10000 : 3000);
const isProd = process.env.NODE_ENV === 'production';

// Production CORS Configuration: Allows GitHub Pages (*.github.io), custom FRONTEND_URL, and local dev
const customFrontendUrl = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || '').replace(/\/+$/, '');

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (health checks, server-to-server, curl, tools)
    if (!origin) {
      return callback(null, true);
    }

    // In development or preview environments, allow local development and cloud run previews
    if (!isProd || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.endsWith('.run.app')) {
      return callback(null, true);
    }

    // Allow any GitHub Pages domain (e.g., https://username.github.io or https://org.github.io)
    if (/^https:\/\/[a-zA-Z0-9-]+\.github\.io(?::\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow explicitly configured frontend domain
    if (customFrontendUrl && (origin === customFrontendUrl || origin.startsWith(customFrontendUrl))) {
      return callback(null, true);
    }

    return callback(new Error(`Origin '${origin}' not allowed by CORS.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root endpoint: Returns backend service status (API-first architecture for Render + GitHub Pages)
app.get('/', (_req, res) => {
  res.status(200).json({
    name: 'JEXA API',
    status: 'online',
  });
});

// Health check endpoint (Render health monitoring) - Never exposes credentials or secrets
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

// Mount REST API endpoints
app.use('/api', apiRoutes);

// Server startup function
async function startServer() {
  if (!isProd) {
    // Development mode: Mount Vite middleware for fast live preview
    try {
      const { createServer: createViteServer } = await import('vite');
      const isHmrDisabled = process.env.DISABLE_HMR === 'true';
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: isHmrDisabled ? false : undefined,
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('[Server] Vite middleware mounted in development mode.');
    } catch (viteError) {
      console.error('[Server] Failed to load Vite middleware:', viteError);
    }
  } else {
    // Production mode on Render:
    // Pure API-first architecture. The frontend is hosted on GitHub Pages.
    console.log('[Server] Render API-first architecture active. Frontend served by GitHub Pages.');
  }

  // Central error handling middleware
  app.use(errorHandler);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(` JEXA AI Companion Server Online`);
    console.log(` Powered by JOHNEY TEC`);
    console.log(`[Server] Listening on 0.0.0.0:${PORT}`);
    console.log(` Port: ${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(` URL: http://0.0.0.0:${PORT}`);
    if (isSupabaseConfigured) {
      console.log(`[Database] Supabase connected`);
    } else if (isProd) {
      console.error(`[Database] CONFIGURATION ERROR: Supabase credentials missing in production environment.`);
    } else {
      console.log(`[Database] Operating in memory-buffered development mode.`);
    }
    console.log(`[Server] Ready`);
    console.log(`=========================================`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n[Server] Shutting down gracefully...');
    server.close(() => {
      console.log('[Server] Closed out remaining connections.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
