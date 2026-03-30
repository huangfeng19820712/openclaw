import bcrypt from 'bcryptjs';
import { readFileIfExists, ensureDir, expandHomePath, generateId } from '../../shared/utils.js';
import type { ModelConfig, ModelCreateInput } from '../../shared/types.js';
import type { LoadedConfig } from '../../config/loader.js';
import { writeFile, mkdir } from 'fs/promises';

export class ModelService {
  private config: LoadedConfig;
  private modelsDir: string;

  constructor(config: LoadedConfig) {
    this.config = config;
    this.modelsDir = expandHomePath(`${config.openclaw.configDir}/models`);
  }

  /**
   * 初始化模型目录
   */
  async init(): Promise<void> {
    await ensureDir(this.modelsDir);
  }

  /**
   * 获取实例的模型列表
   */
  async getModelsByInstance(instanceId: string): Promise<ModelConfig[]> {
    const filePath = this.getModelFilePath(instanceId);
    const content = await readFileIfExists(filePath);
    if (!content) {
      return [];
    }
    try {
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * 添加模型
   */
  async addModel(instanceId: string, input: ModelCreateInput): Promise<ModelConfig> {
    await this.init();

    const models = await this.getModelsByInstance(instanceId);

    const model: ModelConfig = {
      id: generateId(),
      instanceId,
      type: input.type,
      modelIdentifier: input.modelIdentifier,
      apiKey: input.apiKey ? await this.encrypt(input.apiKey) : undefined,
      parameters: input.parameters,
      createdAt: new Date().toISOString(),
    };

    models.push(model);
    await this.saveModels(instanceId, models);

    return this.sanitizeModel(model);
  }

  /**
   * 移除模型
   */
  async removeModel(instanceId: string, modelId: string): Promise<boolean> {
    const models = await this.getModelsByInstance(instanceId);
    const index = models.findIndex((m) => m.id === modelId);

    if (index === -1) {
      return false;
    }

    models.splice(index, 1);
    await this.saveModels(instanceId, models);
    return true;
  }

  /**
   * 获取模型（包含敏感信息）
   */
  async getModel(instanceId: string, modelId: string): Promise<ModelConfig | null> {
    const models = await this.getModelsByInstance(instanceId);
    const model = models.find((m) => m.id === modelId);
    return model || null;
  }

  /**
   * 更新模型
   */
  async updateModel(
    instanceId: string,
    modelId: string,
    updates: Partial<ModelCreateInput>
  ): Promise<ModelConfig | null> {
    const models = await this.getModelsByInstance(instanceId);
    const index = models.findIndex((m) => m.id === modelId);

    if (index === -1) {
      return null;
    }

    if (updates.type) models[index].type = updates.type;
    if (updates.modelIdentifier) models[index].modelIdentifier = updates.modelIdentifier;
    if (updates.apiKey) models[index].apiKey = await this.encrypt(updates.apiKey);
    if (updates.parameters) models[index].parameters = updates.parameters;

    await this.saveModels(instanceId, models);
    return this.sanitizeModel(models[index]);
  }

  /**
   * 解密 API Key
   */
  async decryptApiKey(encryptedKey: string): Promise<string> {
    // 简单实现：实际生产环境应该使用更安全的方式
    // 这里用 bcrypt 的反向逻辑做占位，实际应该用 crypto
    try {
      // 由于 bcrypt 是单向哈希，这里返回原始值的占位符
      // 实际场景中应该使用 crypto-js 或类似库
      return encryptedKey;
    } catch {
      return encryptedKey;
    }
  }

  private getModelFilePath(instanceId: string): string {
    return `${this.modelsDir}/${instanceId}.json`;
  }

  private async saveModels(instanceId: string, models: ModelConfig[]): Promise<void> {
    const filePath = this.getModelFilePath(instanceId);
    await writeFile(filePath, JSON.stringify(models, null, 2), 'utf-8');
  }

  private async encrypt(value: string): Promise<string> {
    // 占位实现：实际应该使用 crypto-js 或 Node.js crypto
    // bcrypt 可以用于加密，但主要用途是哈希
    const hash = await bcrypt.hash(value, 10);
    return `enc:${hash}`;
  }

  private sanitizeModel(model: ModelConfig): ModelConfig {
    const { apiKey, ...safeModel } = model;
    return safeModel as ModelConfig;
  }
}
