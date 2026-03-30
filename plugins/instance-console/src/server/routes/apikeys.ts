import { Router } from 'express';
import type { Request, Response } from 'express';
import type { UserService } from '../services/user.js';

export function createApiKeysRouter(userService: UserService) {
  const router = Router();

  /**
   * GET /api/apikeys
   * 获取当前用户的 API Key 列表
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ ok: false, error: '未认证' });
        return;
      }

      const apiKeys = await userService.getApiKeysByUser(req.user.userId);

      res.json({
        ok: true,
        data: {
          items: apiKeys,
          total: apiKeys.length,
        },
      });
    } catch (error) {
      console.error('Get API keys error:', error);
      res.status(500).json({ ok: false, error: '获取 API Key 列表失败' });
    }
  });

  /**
   * POST /api/apikeys
   * 生成新的 API Key
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ ok: false, error: '未认证' });
        return;
      }

      const { name } = req.body;

      if (!name) {
        res.status(400).json({ ok: false, error: 'API Key 名称不能为空' });
        return;
      }

      const result = await userService.createApiKey(req.user.userId, name);

      // 返回完整的 key（只显示一次）
      res.status(201).json({
        ok: true,
        data: {
          apiKey: result.apiKey,
          key: result.key, // 完整 key，只在此处返回
        },
      });
    } catch (error) {
      console.error('Create API key error:', error);
      res.status(500).json({ ok: false, error: '生成 API Key 失败' });
    }
  });

  /**
   * DELETE /api/apikeys/:id
   * 删除 API Key
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ ok: false, error: '未认证' });
        return;
      }

      const { id } = req.params;
      const deleted = await userService.deleteApiKey(id, req.user.userId);

      if (!deleted) {
        res.status(404).json({ ok: false, error: 'API Key 不存在' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Delete API key error:', error);
      res.status(500).json({ ok: false, error: '删除 API Key 失败' });
    }
  });

  return router;
}
