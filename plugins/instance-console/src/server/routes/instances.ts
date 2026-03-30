import { Router } from 'express';
import type { Request, Response } from 'express';
import type { InstanceService } from '../services/instance.js';

export function createInstancesRouter(instanceService: InstanceService) {
  const router = Router();

  /**
   * GET /api/instances
   * 获取所有实例列表
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { status, search } = req.query;

      let instances = await instanceService.getInstances();

      // 按状态筛选
      if (status && status !== 'all') {
        instances = instances.filter((inst) => inst.status === status);
      }

      // 按搜索条件筛选
      if (search) {
        const searchLower = String(search).toLowerCase();
        instances = instances.filter(
          (inst) =>
            inst.sessionKey.toLowerCase().includes(searchLower) ||
            inst.displayName?.toLowerCase().includes(searchLower)
        );
      }

      res.json({
        ok: true,
        data: {
          items: instances,
          total: instances.length,
        },
      });
    } catch (error) {
      console.error('Get instances error:', error);
      res.status(500).json({ ok: false, error: '获取实例列表失败' });
    }
  });

  /**
   * GET /api/instances/:id
   * 获取实例详情
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const instance = await instanceService.getInstanceBySessionKey(id);

      if (!instance) {
        res.status(404).json({ ok: false, error: '实例不存在' });
        return;
      }

      res.json({ ok: true, data: instance });
    } catch (error) {
      console.error('Get instance error:', error);
      res.status(500).json({ ok: false, error: '获取实例详情失败' });
    }
  });

  /**
   * POST /api/instances
   * 创建新实例
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        sessionKey,
        displayName,
        dockerImage,
      } = req.body;

      if (!sessionKey) {
        res.status(400).json({ ok: false, error: 'Session Key 不能为空' });
        return;
      }

      // 检查是否已存在
      const existing = await instanceService.getInstanceBySessionKey(sessionKey);
      if (existing) {
        res.status(409).json({ ok: false, error: '实例已存在' });
        return;
      }

      const instance = await instanceService.createInstance({
        sessionKey,
        displayName,
        dockerImage,
      });

      res.status(201).json({ ok: true, data: instance });
    } catch (error) {
      console.error('Create instance error:', error);
      res.status(500).json({ ok: false, error: `创建实例失败: ${error}` });
    }
  });

  /**
   * PUT /api/instances/:id
   * 更新实例配置
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { displayName, env, idleTimeoutHours } = req.body;

      const instance = await instanceService.updateInstance(id, {
        displayName,
        env,
        idleTimeoutHours,
      });

      if (!instance) {
        res.status(404).json({ ok: false, error: '实例不存在' });
        return;
      }

      res.json({ ok: true, data: instance });
    } catch (error) {
      console.error('Update instance error:', error);
      res.status(500).json({ ok: false, error: '更新实例失败' });
    }
  });

  /**
   * DELETE /api/instances/:id
   * 删除实例
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { confirmName } = req.body;

      const instance = await instanceService.getInstanceBySessionKey(id);
      if (!instance) {
        res.status(404).json({ ok: false, error: '实例不存在' });
        return;
      }

      // 安全确认：需要输入实例名称确认删除
      if (confirmName && confirmName !== id) {
        res.status(400).json({ ok: false, error: '实例名称确认不正确' });
        return;
      }

      const deleted = await instanceService.deleteInstance(id);

      if (!deleted) {
        res.status(500).json({ ok: false, error: '删除实例失败' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Delete instance error:', error);
      res.status(500).json({ ok: false, error: '删除实例失败' });
    }
  });

  return router;
}
