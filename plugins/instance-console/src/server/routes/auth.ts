import { Router } from 'express';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import type { UserService } from '../services/user.js';
import type { JwtPayload, AuthResponse } from '../../shared/types.js';

export function createAuthRouter(userService: UserService, jwtSecret: string, sessionExpire: number) {
  const router = Router();

  /**
   * POST /api/auth/login
   * 用户登录
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ ok: false, error: '用户名和密码不能为空' });
        return;
      }

      const user = await userService.validateCredentials(username, password);

      if (!user) {
        res.status(401).json({ ok: false, error: '用户名或密码错误' });
        return;
      }

      const payload: JwtPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        type: 'access',
      };

      const token = jwt.sign(payload, jwtSecret, { expiresIn: sessionExpire });

      res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ ok: false, error: '登录失败' });
    }
  });

  /**
   * POST /api/auth/logout
   * 用户登出
   */
  router.post('/logout', async (req: Request, res: Response) => {
    // JWT 是无状态的，登出只需要客户端删除 token
    // 这里可以添加 token 黑名单（如果需要）
    res.json({ ok: true });
  });

  /**
   * GET /api/auth/me
   * 获取当前用户信息
   */
  router.get('/me', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ ok: false, error: '未提供认证信息' });
        return;
      }

      const token = authHeader.slice(7);

      try {
        const payload = jwt.verify(token, jwtSecret) as JwtPayload;
        const user = await userService.getUserById(payload.userId);

        if (!user) {
          res.status(401).json({ ok: false, error: '用户不存在' });
          return;
        }

        res.json({
          ok: true,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
          },
        });
      } catch {
        res.status(401).json({ ok: false, error: 'Token 无效或已过期' });
      }
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ ok: false, error: '获取用户信息失败' });
    }
  });

  /**
   * PUT /api/auth/password
   * 修改密码
   */
  router.put('/password', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ ok: false, error: '未提供认证信息' });
        return;
      }

      const token = authHeader.slice(7);
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ ok: false, error: '当前密码和新密码不能为空' });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({ ok: false, error: '新密码长度至少为 8 个字符' });
        return;
      }

      // 验证当前密码
      const user = await userService.validateCredentials(payload.username, currentPassword);
      if (!user) {
        res.status(401).json({ ok: false, error: '当前密码错误' });
        return;
      }

      // 更新密码
      const updated = await userService.updatePassword(user.id, newPassword);
      if (!updated) {
        res.status(500).json({ ok: false, error: '更新密码失败' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ ok: false, error: '修改密码失败' });
    }
  });

  /**
   * POST /api/auth/init
   * 初始化管理员账号（首次启动时）
   */
  router.post('/init', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ ok: false, error: '用户名和密码不能为空' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ ok: false, error: '密码长度至少为 8 个字符' });
        return;
      }

      const hasAdmin = await userService.hasAdmin();
      if (hasAdmin) {
        res.status(403).json({ ok: false, error: '管理员账号已存在，请直接登录' });
        return;
      }

      const user = await userService.createAdmin({ username, password });

      const payload: JwtPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        type: 'access',
      };

      const token = jwt.sign(payload, jwtSecret, { expiresIn: sessionExpire });

      res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Init admin error:', error);
      res.status(500).json({ ok: false, error: '初始化管理员账号失败' });
    }
  });

  return router;
}
