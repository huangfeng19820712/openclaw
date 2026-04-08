import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ModelService, ProviderConfig, ModelDefinitionConfig } from '../services/model.js';
import { PROVIDER_TEMPLATES, PREDEFINED_MODELS } from '../services/model.js';

export function createModelsRouter(modelService: ModelService) {
  const router = Router();

  /**
   * GET /api/models/catalog
   * 获取可用的模型目录
   */
  router.get('/catalog', async (req: Request, res: Response) => {
    try {
      // 返回预定义的 provider 模板和模型列表
      const catalog = Object.entries(PROVIDER_TEMPLATES).map(([id, template]) => ({
        id,
        name: template.name,
        baseUrl: template.baseUrl,
        api: template.api,
        models: PREDEFINED_MODELS[id] || [],
      }));

      res.json({
        ok: true,
        data: catalog,
      });
    } catch (error) {
      console.error('Get catalog error:', error);
      res.status(500).json({ ok: false, error: '获取模型目录失败' });
    }
  });

  /**
   * GET /api/models/providers
   * 获取已配置的 providers
   */
  router.get('/providers', async (req: Request, res: Response) => {
    try {
      const providers = await modelService.getConfiguredProviders();
      res.json({
        ok: true,
        data: providers,
      });
    } catch (error) {
      console.error('Get providers error:', error);
      res.status(500).json({ ok: false, error: '获取 providers 失败' });
    }
  });

  /**
   * GET /api/models/providers/:providerId
   * 获取 provider 详情
   */
  router.get('/providers/:providerId', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const provider = await modelService.getProvider(providerId);

      if (!provider) {
        res.status(404).json({ ok: false, error: 'Provider 不存在' });
        return;
      }

      // 获取解密后的 API Key
      const apiKey = await modelService.getDecryptedApiKey(providerId);

      res.json({
        ok: true,
        data: {
          id: providerId,  // 添加 id 字段
          ...provider,
          apiKey: apiKey || undefined,
        },
      });
    } catch (error) {
      console.error('Get provider error:', error);
      res.status(500).json({ ok: false, error: '获取 Provider 详情失败' });
    }
  });

  /**
   * POST /api/models/providers
   * 添加或更新 provider
   */
  router.post('/providers', async (req: Request, res: Response) => {
    try {
      const { providerId, baseUrl, apiKey, api, models } = req.body;

      if (!providerId || !baseUrl) {
        res.status(400).json({ ok: false, error: 'Provider ID 和 baseUrl 不能为空' });
        return;
      }

      const provider = await modelService.saveProvider(providerId, {
        baseUrl,
        apiKey,
        api,
        models: models || [],
      });

      res.status(201).json({ ok: true, data: provider });
    } catch (error) {
      console.error('Save provider error:', error);
      res.status(500).json({ ok: false, error: '保存 Provider 失败' });
    }
  });

  /**
   * POST /api/models/providers/test-config
   * 测试 Provider 配置（不保存）
   */
  router.post('/providers/test-config', async (req: Request, res: Response) => {
    try {
      const { providerId, baseUrl, apiKey, api, modelId } = req.body;

      if (!providerId || !baseUrl || !apiKey || !api) {
        res.status(400).json({ ok: false, error: '缺少必要的配置参数' });
        return;
      }

      const result = await modelService.testProviderConfig({
        providerId,
        baseUrl,
        apiKey,
        api,
        modelId,
      });

      res.json(result);
    } catch (error) {
      console.error('Test provider config error:', error);
      res.status(500).json({ ok: false, error: '测试连接失败' });
    }
  });

  /**
   * POST /api/models/providers/:providerId/test
   * 测试已保存的 Provider 连接
   */
  router.post('/providers/:providerId/test', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const result = await modelService.testProviderConnection(providerId);
      res.json(result);
    } catch (error) {
      console.error('Test provider connection error:', error);
      res.status(500).json({ ok: false, error: '测试连接失败' });
    }
  });

  /**
   * DELETE /api/models/providers/:providerId
   * 删除 provider
   */
  router.delete('/providers/:providerId', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const deleted = await modelService.deleteProvider(providerId);

      if (!deleted) {
        res.status(404).json({ ok: false, error: 'Provider 不存在' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Delete provider error:', error);
      res.status(500).json({ ok: false, error: '删除 Provider 失败' });
    }
  });

  /**
   * POST /api/models/providers/:providerId/models
   * 添加模型到 provider
   */
  router.post('/providers/:providerId/models', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const model: ModelDefinitionConfig = req.body;

      if (!model.id) {
        res.status(400).json({ ok: false, error: '模型 ID 不能为空' });
        return;
      }

      const success = await modelService.addModelToProvider(providerId, model);

      if (!success) {
        res.status(404).json({ ok: false, error: 'Provider 不存在' });
        return;
      }

      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Add model error:', error);
      res.status(500).json({ ok: false, error: '添加模型失败' });
    }
  });

  /**
   * DELETE /api/models/providers/:providerId/models/:modelId
   * 从 provider 移除模型
   */
  router.delete('/providers/:providerId/models/:modelId', async (req: Request, res: Response) => {
    try {
      const { providerId, modelId } = req.params;
      const deleted = await modelService.removeModelFromProvider(providerId, modelId);

      if (!deleted) {
        res.status(404).json({ ok: false, error: 'Provider 或模型不存在' });
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
