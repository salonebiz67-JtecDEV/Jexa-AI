import { Request, Response, NextFunction } from 'express';
import { ErrorLogService } from '../services/error-log.service';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Unhandled Server Error]', err);
  ErrorLogService.log('system', err, {
    statusCode: err.statusCode || 500,
    path: _req.path,
    method: _req.method,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected internal server error occurred.';

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  });
}
