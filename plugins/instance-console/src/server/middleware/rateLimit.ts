/**
 * 简单的内存限流器
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * 清理过期的记录
 */
function cleanExpired(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

// 每分钟清理一次
setInterval(cleanExpired, 60000);

/**
 * 创建限流中间件
 * @param maxRequests 最大请求次数
 * @param windowMs 时间窗口（毫秒）
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      // 创建新窗口
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, entry);
      next();
      return;
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.status(429).json({
        ok: false,
        error: '请求过于频繁，请稍后再试',
        retryAfter,
      });
      return;
    }

    next();
  };
}
