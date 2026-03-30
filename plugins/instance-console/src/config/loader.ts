import { readFile } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';
import { expandHomePath, ensureDir } from '../shared/utils.js';
import type { AppConfig } from '../shared/types.js';

const CONFIG_DIR = '~/.instance-console';
const CONFIG_FILE = 'config.yaml';

export interface LoadedConfig extends AppConfig {
  configDir: string;
}

const DEFAULT_CONFIG: AppConfig = {
  server: {
    port: 12548,
    host: '0.0.0.0',
  },
  auth: {
    jwtSecret: '',
    sessionExpire: 86400,
  },
  cors: {
    allowedOrigins: ['http://localhost:12548', 'http://localhost:12549'],
  },
  openclaw: {
    configDir: '~/.openclaw',
    registryFile: '~/.openclaw/sandbox/containers.json',
  },
  api: {
    enableApiKey: true,
    rateLimit: 100,
  },
  webhook: {
    enabled: false,
    url: '',
    secret: '',
    events: [
      'instance.created',
      'instance.started',
      'instance.stopped',
      'instance.deleted',
    ],
  },
};

/**
 * 获取配置目录路径
 */
export function getConfigDir(): string {
  return expandHomePath(CONFIG_DIR);
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILE);
}

/**
 * 加载配置文件
 */
export async function loadConfig(): Promise<LoadedConfig> {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  // 确保配置目录存在
  await ensureDir(configDir);

  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = YAML.parse(content) as Partial<AppConfig>;

    const config: AppConfig = {
      server: { ...DEFAULT_CONFIG.server, ...parsed.server },
      auth: { ...DEFAULT_CONFIG.auth, ...parsed.auth },
      cors: { ...DEFAULT_CONFIG.cors, ...parsed.cors },
      openclaw: { ...DEFAULT_CONFIG.openclaw, ...parsed.openclaw },
      api: { ...DEFAULT_CONFIG.api, ...parsed.api },
      webhook: { ...DEFAULT_CONFIG.webhook, ...parsed.webhook },
    };

    // 验证必要配置
    if (!config.auth.jwtSecret) {
      throw new Error('JWT secret is required in config');
    }

    return { ...config, configDir };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`配置文件不存在: ${configPath}`);
    }
    throw error;
  }
}

/**
 * 检查配置文件是否存在
 */
export async function configExists(): Promise<boolean> {
  try {
    const fs = await import('fs/promises');
    await fs.access(getConfigPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * 保存配置文件
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath();
  const configDir = getConfigDir();

  await ensureDir(configDir);

  const yamlContent = YAML.stringify(config, { indent: 2 });
  const fs = await import('fs/promises');
  await fs.writeFile(configPath, yamlContent, 'utf-8');
}

/**
 * 创建初始配置文件
 */
export async function createInitialConfig(jwtSecret: string): Promise<LoadedConfig> {
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    auth: {
      ...DEFAULT_CONFIG.auth,
      jwtSecret,
    },
  };

  await saveConfig(config);

  return { ...config, configDir: getConfigDir() };
}
