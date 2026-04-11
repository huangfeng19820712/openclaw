import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ContainerService } from '../services/container.js';

export function createSystemRouter(containerService: ContainerService) {
  const router = Router();

  /**
   * GET /api/system/stats
   * 获取系统统计信息
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const [dockerInfo, diskUsage, memoryUsage, containers] = await Promise.all([
        containerService.getDockerInfo(),
        containerService.getDiskUsage(),
        containerService.getMemoryUsage(),
        containerService.listSandboxContainers(),
      ]);

      // 计算实例统计
      const instanceStats = {
        total: containers.length,
        running: containers.filter(c => c.status.toLowerCase().startsWith('up')).length,
        stopped: containers.filter(c => c.status.includes('exited') || c.status.includes('Created')).length,
        error: containers.filter(c => {
          const s = c.status.toLowerCase();
          return !s.startsWith('up') && !s.includes('exited') && !s.includes('created');
        }).length,
      };

      res.json({
        ok: true,
        data: {
          docker: dockerInfo,
          disk: diskUsage,
          memory: memoryUsage,
          instances: instanceStats,
        },
      });
    } catch (error) {
      console.error('Get system stats error:', error);
      res.status(500).json({ ok: false, error: '获取系统统计信息失败' });
    }
  });

  return router;
}
