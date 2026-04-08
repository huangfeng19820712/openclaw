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
   * 创建新实例（异步方式）
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

      // 异步创建，立即返回任务 ID
      const { taskId } = instanceService.createInstance({
        sessionKey,
        displayName,
        dockerImage,
      });

      res.status(202).json({ ok: true, data: { taskId } });
    } catch (error) {
      console.error('Create instance error:', error);
      res.status(500).json({ ok: false, error: `创建实例失败: ${error}` });
    }
  });

  /**
   * GET /api/instances/tasks/:taskId
   * 获取创建任务状态
   */
  router.get('/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const task = instanceService.getCreateTask(taskId);

      if (!task) {
        res.status(404).json({ ok: false, error: '任务不存在' });
        return;
      }

      res.json({
        ok: true,
        data: {
          status: task.status,
          progress: task.progress,
          error: task.error,
        },
      });
    } catch (error) {
      console.error('Get task error:', error);
      res.status(500).json({ ok: false, error: '获取任务状态失败' });
    }
  });

  /**
   * GET /api/instances/tasks/:taskId/result
   * 获取创建任务结果
   */
  router.get('/tasks/:taskId/result', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const task = instanceService.getCreateTask(taskId);

      if (!task) {
        res.status(404).json({ ok: false, error: '任务不存在' });
        return;
      }

      if (task.status === 'pending' || task.status === 'running') {
        res.json({
          ok: true,
          data: {
            status: task.status,
            progress: task.progress,
          },
        });
        return;
      }

      if (task.status === 'failed') {
        res.status(400).json({ ok: false, error: task.error || '创建失败' });
        return;
      }

      res.json({ ok: true, data: task.result });
    } catch (error) {
      console.error('Get task result error:', error);
      res.status(500).json({ ok: false, error: '获取任务结果失败' });
    }
  });

  /**
   * POST /api/instances/:id/generate-invite
   * 为已有实例生成邀请码
   */
  router.post('/:id/generate-invite', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await instanceService.generateInviteCode(id);

      res.json({ ok: true, data: result });
    } catch (error) {
      console.error('Generate invite error:', error);
      res.status(500).json({ ok: false, error: `生成邀请码失败: ${error}` });
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
