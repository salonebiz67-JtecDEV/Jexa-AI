import { Request, Response, NextFunction } from 'express';
import { ErrorLogService } from '../services/error-log.service';
import { scrubSecretsAndUrls } from '../../../shared/types/provider';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Unhandled Server Error]', err);
  ErrorLogService.log('system', err, {
    statusCode: err?.statusCode || err?.status || 500,
    path: req.path,
    method: req.method,
  });

  let statusCode = Number(err?.statusCode || err?.status || 500);
  let code = err?.code || 'INTERNAL_ERROR';
  let message = err?.message || 'An unexpected internal server error occurred.';

  if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Invalid JSON request payload.';
  } else if (err?.type === 'entity.too.large' || statusCode === 413) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload exceeds maximum allowed size.';
  } else if (typeof message === 'string' && message.includes('not allowed by CORS')) {
    statusCode = 403;
    code = 'CORS_FORBIDDEN';
  }

  if (statusCode < 400 || statusCode >= 600) {
    statusCode = 500;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const safeMessage =
    isProd && statusCode >= 500
      ? 'An unexpected internal server error occurred.'
      : scrubSecretsAndUrls(String(message));

  res.status(statusCode).json({
    success: false,
    code,
    error: safeMessage,
    timestamp: new Date().toISOString(),
  });
}
