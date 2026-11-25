import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import apiRoutes from './backend/src/routes/api.routes';
import { errorHandler } from './backend/src/middleware/error.middleware';
import { securityHeadersMiddleware } from './backend/src/middleware/security-headers.middleware';
import { AIProviderRegistry } from './ai/providers/registry';

// Load environment variables
dotenv.config();

// ESM-compatible path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default to 10000 on Render/production, or 3000 in local dev environment
const PORT = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 10000 : 3000);

const CAPACITOR_NATIVE_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
]);

export function parseAllowedCorsOrigins(): Set<string> {
  const allowed = new Set<string>();
  const rawSources = [
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
    process.env.CORS_ALLOWED_ORIGINS,
  ];
  for (const raw of rawSources) {
    if (!raw || typeof raw !== 'string') continue;
    for (const part of raw.split(',')) {
      const candidate = part.trim().replace(/\/+$/, '');
      if (!candidate) continue;
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          allowed.add(parsed.origin);
        }
      } catch {
        console.warn(`[CORS] Ignoring malformed configured origin entry: "${candidate}"`);
      }
    }
  }
  return allowed;
}

export function isOriginAllowed(origin: string | undefined, isProd: boolean, configuredOrigins: Set<string>): boolean {
  // Allow non-browser requests (health checks, server-to-server, curl, tools)
  if (!origin) {
    return true;
  }

  // Explicitly accept Capacitor native Android/iOS WebView origins
  if (CAPACITOR_NATIVE_ORIGINS.has(origin)) {
    return true;
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    return false;
  }

  // Exact match against explicitly configured frontend origins
  if (configuredOrigins.has(parsedOrigin.origin)) {
    return true;
  }

  // In non-production environments, allow local development loopback hosts and Cloud Run preview hosts
  if (!isProd) {
    const hostname = parsedOrigin.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
    if (parsedOrigin.protocol === 'https:' && hostname.endsWith('.run.app')) {
      return true;
    }
  }

  // In production, if no explicit FRONTEND_URL/CORS_ORIGIN is configured yet, allow strict https://<org>.github.io
  // so unconfigured GitHub Pages deployments continue operating until FRONTEND_URL is pinned.
  if (
    (configuredOrigins.size === 0 || process.env.ALLOW_WILDCARD_GITHUB_PAGES === 'true') &&
    parsedOrigin.protocol === 'https:' &&
    !parsedOrigin.port &&
    /^[a-zA-Z0-9-]+\.github\.io$/.test(parsedOrigin.hostname)
  ) {
    return true;
  }

  return false;
}

export function createApp(options: { includeErrorHandler?: boolean } = {}) {
  const { includeErrorHandler = true } = options;
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const configuredOrigins = parseAllowedCorsOrigins();

  if (isProd && configuredOrigins.size === 0) {
    console.warn(
      '[CORS] Warning: FRONTEND_URL / CORS_ORIGIN is not configured in production; allowing strict *.github.io HTTPS origins until pinned.'
    );
  }

  // Security basics: hide Express signature and trust single reverse-proxy hop (Render)
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware);

  // Strict CORS Configuration: Exact allowlist matching + Capacitor native WebView origins
  app.use(cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, isProd, configuredOrigins)) {
        return callback(null, true);
      }
      const corsErr: any = new Error(`Origin '${origin}' not allowed by CORS.`);
      corsErr.statusCode = 403;
      return callback(corsErr);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control'],
    maxAge: 86400,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // Root endpoint: Returns backend service status (API-first architecture for Render + GitHub Pages)
  app.get('/', (_req, res) => {
    res.status(200).json({
      name: 'JEXA API',
      status: 'online',
    });
  });

  // Health check endpoint (Render health monitoring) - Never exposes credentials, URLs, or secrets
  app.get('/health', (_req, res) => {
    const registry = AIProviderRegistry.getInstance();
    res.status(200).json({
      status: 'ok',
      service: 'jexa-ai',
      stateless: true,
      gatewayActive: registry.isGatewayActive(),
      textProvider: registry.getDefaultTextType(),
      voiceProvider: registry.getDefaultVoiceType(),
    });
  });

  // Mount REST API endpoints
  app.use('/api', apiRoutes);

  if (includeErrorHandler) {
    app.use(errorHandler);
  }

  return app;
}

// Server startup function
export async function startServer() {
  const app = createApp({ includeErrorHandler: false });
  const isProd = process.env.NODE_ENV === 'production';

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
    console.log(`[Server] Stateless API mode active (device-local persistence)`);
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

  return server;
}

const isDirectEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectEntry) {
  startServer().catch((err) => {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  });
}
