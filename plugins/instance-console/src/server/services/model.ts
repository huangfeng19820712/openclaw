import { readFileIfExists, expandHomePath, generateId } from '../../shared/utils.js';
import type { LoadedConfig } from '../../config/loader.js';
import { writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Provider 定义
export interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;  // 加密存储
  auth?: string;
  api?: string;
  models: ModelDefinitionConfig[];
}

export interface ModelDefinitionConfig {
  id: string;
  name: string;
  api?: string;
  reasoning?: boolean;
  input?: string[];
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow?: number;
  maxTokens?: number;
}

export interface OpenClawModelsConfig {
  mode?: 'merge' | 'replace';
  providers?: Record<string, ProviderConfig>;
}

// API Key 加密
const ENCRYPTION_KEY = crypto.scryptSync('instance-console-models', 'salt', 32);

function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptApiKey(encrypted: string): string {
  try {
    const [ivHex, encryptedData] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

interface OpenClawConfigRoot {
  models?: OpenClawModelsConfig;
  [key: string]: unknown;
}

export class ModelService {
  private config: LoadedConfig;
  private configPath: string;

  constructor(config: LoadedConfig) {
    this.config = config;
    this.configPath = path.join(expandHomePath(config.openclaw.configDir), 'openclaw.json');
  }

  /**
   * 初始化 - 新版本不需要初始化操作
   */
  async init(): Promise<void> {
    // No-op for new version
  }

  /**
   * 读取 openclaw.json 配置
   */
  private async readOpenClawConfig(): Promise<OpenClawConfigRoot> {
    const content = await readFileIfExists(this.configPath);
    if (!content) {
      return {};
    }
    try {
      return JSON.parse(content) as OpenClawConfigRoot;
    } catch {
      return {};
    }
  }

  /**
   * 写入 openclaw.json 配置
   */
  private async writeOpenClawConfig(config: OpenClawConfigRoot): Promise<void> {
    const dir = path.dirname(this.configPath);
    const { ensureDir } = await import('../../shared/utils.js');
    await ensureDir(dir);
    await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * 获取所有已配置的 providers
   */
  async getConfiguredProviders(): Promise<Array<{ id: string; baseUrl: string; modelCount: number; hasApiKey: boolean }>> {
    const config = await this.readOpenClawConfig();
    const models = config.models as OpenClawModelsConfig | undefined;

    if (!models?.providers) {
      return [];
    }

    return Object.entries(models.providers).map(([id, provider]) => ({
      id,
      baseUrl: provider.baseUrl || '',
      modelCount: provider.models?.length || 0,
      hasApiKey: Boolean(provider.apiKey),
    }));
  }

  /**
   * 获取 provider 的详细信息
   */
  async getProvider(providerId: string): Promise<ProviderConfig | null> {
    const config = await this.readOpenClawConfig();
    const models = config.models as OpenClawModelsConfig | undefined;

    if (!models?.providers?.[providerId]) {
      return null;
    }

    return models.providers[providerId];
  }

  /**
   * 添加或更新 provider
   */
  async saveProvider(providerId: string, provider: Omit<ProviderConfig, 'apiKey'> & { apiKey?: string }): Promise<ProviderConfig> {
    const config = await this.readOpenClawConfig();

    if (!config.models) {
      config.models = { mode: 'merge', providers: {} };
    }
    if (!config.models.providers) {
      config.models.providers = {};
    }

    // 加密 API Key
    const encryptedApiKey = provider.apiKey ? encryptApiKey(provider.apiKey) : undefined;

    config.models.providers[providerId] = {
      baseUrl: provider.baseUrl,
      apiKey: encryptedApiKey,
      auth: provider.auth,
      api: provider.api,
      models: provider.models || [],
    };

    await this.writeOpenClawConfig(config);

    // 返回时隐藏 API Key
    const saved = config.models.providers[providerId];
    return {
      ...saved,
      apiKey: undefined,
    };
  }

  /**
   * 删除 provider
   */
  async deleteProvider(providerId: string): Promise<boolean> {
    const config = await this.readOpenClawConfig();
    const models = config.models as OpenClawModelsConfig | undefined;

    if (!models?.providers?.[providerId]) {
      return false;
    }

    delete models.providers[providerId];
    await this.writeOpenClawConfig(config);
    return true;
  }

  /**
   * 添加模型到 provider
   */
  async addModelToProvider(
    providerId: string,
    model: ModelDefinitionConfig
  ): Promise<boolean> {
    const config = await this.readOpenClawConfig();
    const models = config.models as OpenClawModelsConfig | undefined;

    if (!models?.providers?.[providerId]) {
      return false;
    }

    // 检查模型是否已存在
    const existingIndex = models.providers[providerId].models.findIndex(m => m.id === model.id);
    if (existingIndex >= 0) {
      // 更新现有模型
      models.providers[providerId].models[existingIndex] = model;
    } else {
      // 添加新模型
      models.providers[providerId].models.push(model);
    }

    await this.writeOpenClawConfig(config);
    return true;
  }

  /**
   * 从 provider 移除模型
   */
  async removeModelFromProvider(providerId: string, modelId: string): Promise<boolean> {
    const config = await this.readOpenClawConfig();
    const models = config.models as OpenClawModelsConfig | undefined;

    if (!models?.providers?.[providerId]) {
      return false;
    }

    const modelIndex = models.providers[providerId].models.findIndex(m => m.id === modelId);
    if (modelIndex < 0) {
      return false;
    }

    models.providers[providerId].models.splice(modelIndex, 1);
    await this.writeOpenClawConfig(config);
    return true;
  }

  /**
   * 解密并返回 provider 的 API Key
   */
  async getDecryptedApiKey(providerId: string): Promise<string | null> {
    const config = await this.readOpenClawConfig();
    const models = config.models as OpenClawModelsConfig | undefined;

    if (!models?.providers?.[providerId]?.apiKey) {
      return null;
    }

    return decryptApiKey(models.providers[providerId].apiKey!);
  }
}

// 预定义的 provider 配置模板
export const PROVIDER_TEMPLATES: Record<string, {
  name: string;
  baseUrl: string;
  api: string;
  defaultModelId: string;
}> = {
  'openai': {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    api: 'openai-responses',
    defaultModelId: 'gpt-4o',
  },
  'anthropic': {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    api: 'anthropic-messages',
    defaultModelId: 'claude-3-5-sonnet-latest',
  },
  'google': {
    name: 'Google AI',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    api: 'google-generative-ai',
    defaultModelId: 'gemini-2.0-flash',
  },
  'moonshot': {
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    api: 'openai-completions',
    defaultModelId: 'kimi-k2.5',
  },
  'minimax': {
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    api: 'anthropic-messages',
    defaultModelId: 'MiniMax-M2.5',
  },
  'qianfan': {
    name: '百度千帆',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    api: 'openai-completions',
    defaultModelId: 'ernie-4.0-8k-latest',
  },
  'zhipuai': {
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/cogagent/v2',
    api: 'openai-completions',
    defaultModelId: 'glm-4',
  },
  'ollama': {
    name: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    api: 'openai-completions',
    defaultModelId: 'llama3',
  },
};

// 预定义模型列表
export const PREDEFINED_MODELS: Record<string, ModelDefinitionConfig[]> = {
  'openai': [
    { id: 'gpt-4o', name: 'GPT-4o', api: 'openai-responses', reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 16384 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', api: 'openai-responses', reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 16384 },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', api: 'openai-responses', reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 4096 },
    { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest', api: 'openai-responses', reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 16384 },
  ],
  'anthropic': [
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', api: 'anthropic-messages', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 8192 },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', api: 'anthropic-messages', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 8192 },
    { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', api: 'anthropic-messages', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 4096 },
  ],
  'google': [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', api: 'google-generative-ai', reasoning: true, input: ['text', 'image'], contextWindow: 1000000, maxTokens: 8192 },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', api: 'google-generative-ai', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 8192 },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', api: 'google-generative-ai', reasoning: false, input: ['text', 'image'], contextWindow: 1000000, maxTokens: 8192 },
  ],
  'moonshot': [
    { id: 'kimi-k2.5', name: 'Kimi K2.5', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 256000, maxTokens: 8192 },
    { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 16384 },
  ],
  'minimax': [
    { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', api: 'anthropic-messages', reasoning: true, input: ['text'], contextWindow: 200000, maxTokens: 8192 },
    { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 Highspeed', api: 'anthropic-messages', reasoning: true, input: ['text'], contextWindow: 200000, maxTokens: 8192 },
  ],
  'qianfan': [
    { id: 'ernie-4.0-8k-latest', name: 'ERNIE 4.0 8K', api: 'openai-completions', reasoning: true, input: ['text'], contextWindow: 8000, maxTokens: 4096 },
    { id: 'ernie-3.5-8k-latest', name: 'ERNIE 3.5 8K', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 8000, maxTokens: 4096 },
  ],
  'zhipuai': [
    { id: 'glm-4', name: 'GLM-4', api: 'openai-completions', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 4096 },
    { id: 'glm-4-flash', name: 'GLM-4 Flash', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 4096 },
  ],
  'ollama': [
    { id: 'llama3', name: 'Llama 3', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 4096 },
    { id: 'llama3.1', name: 'Llama 3.1', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 4096 },
    { id: 'codellama', name: 'Code Llama', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 16384, maxTokens: 4096 },
    { id: 'qwen2.5', name: 'Qwen 2.5', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 4096 },
    { id: 'mistral', name: 'Mistral', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 4096 },
  ],
};
