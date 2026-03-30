import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ContainerService } from '../services/container.js';
import { sessionKeyToContainerName } from '../../shared/utils.js';

export function createContainersRouter(containerService: ContainerService) {
  const router = Router();

  /**
   * POST /api/containers/:name/start
   * 启动容器
   */
  router.post('/:name/start', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      // 支持使用 sessionKey 作为参数，自动转换为容器名
      const containerName = name.startsWith('openclaw-sbx-') ? name : sessionKeyToContainerName(name);

      const status = await containerService.getContainerStatus(containerName);
      if (status === 'running') {
        res.status(400).json({ ok: false, error: '容器已经在运行' });
        return;
      }

      await containerService.startContainer(containerName);

      res.json({ ok: true, message: '容器已启动' });
    } catch (error) {
      console.error('Start container error:', error);
      res.status(500).json({ ok: false, error: `启动容器失败: ${error}` });
    }
  });

  /**
   * POST /api/containers/:name/stop
   * 停止容器
   */
  router.post('/:name/stop', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const containerName = name.startsWith('openclaw-sbx-') ? name : sessionKeyToContainerName(name);

      const status = await containerService.getContainerStatus(containerName);
      if (status === 'stopped' || status === 'unknown') {
        res.status(400).json({ ok: false, error: '容器已经停止' });
        return;
      }

      await containerService.stopContainer(containerName);

      res.json({ ok: true, message: '容器已停止' });
    } catch (error) {
      console.error('Stop container error:', error);
      res.status(500).json({ ok: false, error: `停止容器失败: ${error}` });
    }
  });

  /**
   * POST /api/containers/:name/restart
   * 重启容器
   */
  router.post('/:name/restart', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const containerName = name.startsWith('openclaw-sbx-') ? name : sessionKeyToContainerName(name);

      await containerService.restartContainer(containerName);

      res.json({ ok: true, message: '容器已重启' });
    } catch (error) {
      console.error('Restart container error:', error);
      res.status(500).json({ ok: false, error: `重启容器失败: ${error}` });
    }
  });

  /**
   * GET /api/containers/:name/logs
   * 获取容器日志
   */
  router.get('/:name/logs', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const containerName = name.startsWith('openclaw-sbx-') ? name : sessionKeyToContainerName(name);
      const tail = parseInt(req.query.tail as string) || 100;

      const logs = await containerService.getContainerLogs(containerName, tail);

      res.json({ ok: true, data: logs });
    } catch (error) {
      console.error('Get container logs error:', error);
      res.status(500).json({ ok: false, error: `获取容器日志失败: ${error}` });
    }
  });

  /**
   * GET /api/containers/:name/status
   * 获取容器状态
   */
  router.get('/:name/status', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const containerName = name.startsWith('openclaw-sbx-') ? name : sessionKeyToContainerName(name);

      const status = await containerService.getContainerStatus(containerName);

      res.json({ ok: true, data: { name: containerName, status } });
    } catch (error) {
      console.error('Get container status error:', error);
      res.status(500).json({ ok: false, error: `获取容器状态失败: ${error}` });
    }
  });

  return router;
}
