import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import apiRoutes from './backend/src/routes/api.routes';
import { errorHandler } from './backend/src/middleware/error.middleware';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Cross-Origin Resource Sharing & Request Body Parsing
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint (Render & Monitoring)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'jexa-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
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
    // Production mode (Render / Container deployment)
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    console.log(`[Server] Production static files served from: ${distPath}`);
  }

  // Central error handling middleware
  app.use(errorHandler);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(` JEXA AI Companion Server Online`);
    console.log(` Powered by JOHNEY TEC`);
    console.log(` Port: ${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(` URL: http://0.0.0.0:${PORT}`);
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
