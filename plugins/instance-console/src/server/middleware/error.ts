import type { Request, Response, NextFunction } from 'express';

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  err: Error & { statusCode?: number; code?: string },
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? '服务器内部错误' : err.message;

  res.status(statusCode).json({
    ok: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: `路由不存在: ${req.method} ${req.path}`,
  });
}

/**
 * 创建自定义错误
 */
export function createError(message: string, statusCode: number): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
