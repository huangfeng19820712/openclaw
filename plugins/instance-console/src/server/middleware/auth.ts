import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { JwtPayload, ApiKey, User } from '../../shared/types.js';
import { readFileIfExists, expandHomePath, safeJsonParse } from '../../shared/utils.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        role: string;
      };
      apiKey?: ApiKey;
    }
  }
}

/**
 * JWT 认证中间件
 */
export function jwtAuth(jwtSecret: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // 检查 API Key
        await checkApiKey(req);
        if (!req.user && !req.apiKey) {
          res.status(401).json({ ok: false, error: '未提供认证信息' });
          return;
        }
        next();
        return;
      }

      const token = authHeader.slice(7);

      try {
        const payload = jwt.verify(token, jwtSecret) as JwtPayload;
        req.user = {
          userId: payload.userId,
          username: payload.username,
          role: payload.role,
        };
        next();
      } catch {
        // Token 无效，检查 API Key
        await checkApiKey(req);
        if (!req.user && !req.apiKey) {
          res.status(401).json({ ok: false, error: 'Token 无效或已过期' });
          return;
        }
        next();
      }
    } catch (error) {
      res.status(500).json({ ok: false, error: '认证处理失败' });
    }
  };
}

/**
 * 仅 JWT 认证中间件（不接受 API Key）
 */
export function jwtAuthOnly(jwtSecret: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ ok: false, error: '未提供 Token' });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;
      req.user = {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      };
      next();
    } catch {
      res.status(401).json({ ok: false, error: 'Token 无效或已过期' });
    }
  };
}

/**
 * 检查 API Key
 */
async function checkApiKey(req: Request): Promise<void> {
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  if (!apiKeyHeader) {
    return;
  }

  try {
    const apiKeysPath = expandHomePath('~/.instance-console/apikeys.json');
    const content = await readFileIfExists(apiKeysPath);

    if (!content) {
      return;
    }

    const apiKeys: ApiKey[] = safeJsonParse(content, []);

    // 查找前缀匹配的 API Key
    const matchedKey = apiKeys.find((key) => {
      return key.keyPrefix && apiKeyHeader.startsWith(key.keyPrefix);
    });

    if (matchedKey && matchedKey.keyHash) {
      // 使用 bcrypt 验证完整的 API Key
      const isValid = await bcrypt.compare(apiKeyHeader, matchedKey.keyHash);
      if (isValid) {
        req.apiKey = matchedKey;
        // 更新最后使用时间
        matchedKey.lastUsedAt = new Date().toISOString();
        // TODO: 保存更新后的 API Key
      }
    }
  } catch {
    // 忽略错误
  }
}

/**
 * 可选认证中间件（不强制要求认证）
 */
export function optionalAuth(jwtSecret: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = jwt.verify(token, jwtSecret) as JwtPayload;
        req.user = {
          userId: payload.userId,
          username: payload.username,
          role: payload.role,
        };
      } catch {
        // Token 无效，忽略
      }
    }

    next();
  };
}
