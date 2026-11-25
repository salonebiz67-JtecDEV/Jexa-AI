import { Request, Response, NextFunction } from 'express';

/**
 * Sets baseline HTTP security headers across all backend responses without
 * breaking cross-origin Capacitor WebViews or GitHub Pages API calls.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()');

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (process.env.NODE_ENV === 'production' || isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Apply strict API Content-Security-Policy on JSON/SSE API & health endpoints
  if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/') {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }

  next();
}
