import { Router } from 'express';
import type { Request, Response } from 'express';
import type { OperationLogService } from '../services/operationLog.js';

export function createOperationLogsRouter(operationLogService: OperationLogService) {
  const router = Router();

  /**
   * GET /api/operation-logs
   * 获取操作日志列表
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await operationLogService.getLogs(limit, offset);

      res.json({
        ok: true,
        data: result,
      });
    } catch (error) {
      console.error('Get operation logs error:', error);
      res.status(500).json({ ok: false, error: '获取操作日志失败' });
    }
  });

  /**
   * DELETE /api/operation-logs
   * 清空操作日志
   */
  router.delete('/', async (req: Request, res: Response) => {
    try {
      await operationLogService.clearLogs();
      res.json({ ok: true });
    } catch (error) {
      console.error('Clear operation logs error:', error);
      res.status(500).json({ ok: false, error: '清空操作日志失败' });
    }
  });

  return router;
}
