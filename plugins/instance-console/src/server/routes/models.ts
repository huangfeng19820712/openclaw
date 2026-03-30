import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ModelService } from '../services/model.js';

export function createModelsRouter(modelService: ModelService) {
  const router = Router();

  /**
   * GET /api/instances/:id/models
   * 获取实例的模型列表
   */
  router.get('/:id/models', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const models = await modelService.getModelsByInstance(id);

      res.json({
        ok: true,
        data: {
          items: models,
          total: models.length,
        },
      });
    } catch (error) {
      console.error('Get models error:', error);
      res.status(500).json({ ok: false, error: '获取模型列表失败' });
    }
  });

  /**
   * POST /api/instances/:id/models
   * 添加模型
   */
  router.post('/:id/models', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { type, modelIdentifier, apiKey, parameters } = req.body;

      if (!type || !modelIdentifier) {
        res.status(400).json({ ok: false, error: '模型类型和标识符不能为空' });
        return;
      }

      const model = await modelService.addModel(id, {
        type,
        modelIdentifier,
        apiKey,
        parameters,
      });

      res.status(201).json({ ok: true, data: model });
    } catch (error) {
      console.error('Add model error:', error);
      res.status(500).json({ ok: false, error: '添加模型失败' });
    }
  });

  /**
   * GET /api/instances/:id/models/:modelId
   * 获取模型详情
   */
  router.get('/:id/models/:modelId', async (req: Request, res: Response) => {
    try {
      const { id, modelId } = req.params;
      const model = await modelService.getModel(id, modelId);

      if (!model) {
        res.status(404).json({ ok: false, error: '模型不存在' });
        return;
      }

      res.json({ ok: true, data: model });
    } catch (error) {
      console.error('Get model error:', error);
      res.status(500).json({ ok: false, error: '获取模型详情失败' });
    }
  });

  /**
   * PUT /api/instances/:id/models/:modelId
   * 更新模型
   */
  router.put('/:id/models/:modelId', async (req: Request, res: Response) => {
    try {
      const { id, modelId } = req.params;
      const { type, modelIdentifier, apiKey, parameters } = req.body;

      const model = await modelService.updateModel(id, modelId, {
        type,
        modelIdentifier,
        apiKey,
        parameters,
      });

      if (!model) {
        res.status(404).json({ ok: false, error: '模型不存在' });
        return;
      }

      res.json({ ok: true, data: model });
    } catch (error) {
      console.error('Update model error:', error);
      res.status(500).json({ ok: false, error: '更新模型失败' });
    }
  });

  /**
   * DELETE /api/instances/:id/models/:modelId
   * 移除模型
   */
  router.delete('/:id/models/:modelId', async (req: Request, res: Response) => {
    try {
      const { id, modelId } = req.params;
      const deleted = await modelService.removeModel(id, modelId);

      if (!deleted) {
        res.status(404).json({ ok: false, error: '模型不存在' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Remove model error:', error);
      res.status(500).json({ ok: false, error: '移除模型失败' });
    }
  });

  return router;
}
