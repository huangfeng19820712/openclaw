import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ChannelService } from '../services/channel.js';

export function createChannelsRouter(channelService: ChannelService) {
  const router = Router();

  /**
   * GET /api/instances/:id/channels
   * 获取实例的渠道列表
   */
  router.get('/:id/channels', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const channels = await channelService.getChannelsByInstance(id);

      res.json({
        ok: true,
        data: {
          items: channels,
          total: channels.length,
        },
      });
    } catch (error) {
      console.error('Get channels error:', error);
      res.status(500).json({ ok: false, error: '获取渠道列表失败' });
    }
  });

  /**
   * POST /api/instances/:id/channels
   * 添加渠道
   */
  router.post('/:id/channels', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { type, credentials, routingRules } = req.body;

      if (!type || !credentials) {
        res.status(400).json({ ok: false, error: '渠道类型和凭证不能为空' });
        return;
      }

      const channel = await channelService.addChannel(id, {
        type,
        credentials,
        routingRules,
      });

      res.status(201).json({ ok: true, data: channel });
    } catch (error) {
      console.error('Add channel error:', error);
      res.status(500).json({ ok: false, error: '添加渠道失败' });
    }
  });

  /**
   * GET /api/instances/:id/channels/:channelId
   * 获取渠道详情
   */
  router.get('/:id/channels/:channelId', async (req: Request, res: Response) => {
    try {
      const { id, channelId } = req.params;
      const channel = await channelService.getChannel(id, channelId);

      if (!channel) {
        res.status(404).json({ ok: false, error: '渠道不存在' });
        return;
      }

      res.json({ ok: true, data: channel });
    } catch (error) {
      console.error('Get channel error:', error);
      res.status(500).json({ ok: false, error: '获取渠道详情失败' });
    }
  });

  /**
   * DELETE /api/instances/:id/channels/:channelId
   * 移除渠道
   */
  router.delete('/:id/channels/:channelId', async (req: Request, res: Response) => {
    try {
      const { id, channelId } = req.params;
      const deleted = await channelService.removeChannel(id, channelId);

      if (!deleted) {
        res.status(404).json({ ok: false, error: '渠道不存在' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Remove channel error:', error);
      res.status(500).json({ ok: false, error: '移除渠道失败' });
    }
  });

  /**
   * POST /api/instances/:id/channels/:channelId/test
   * 测试渠道连接
   */
  router.post('/:id/channels/:channelId/test', async (req: Request, res: Response) => {
    try {
      const { id, channelId } = req.params;
      const result = await channelService.testChannel(id, channelId);

      res.json({ ok: true, data: result });
    } catch (error) {
      console.error('Test channel error:', error);
      res.status(500).json({ ok: false, error: '测试渠道连接失败' });
    }
  });

  return router;
}
