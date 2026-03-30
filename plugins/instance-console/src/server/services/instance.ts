import { readFileIfExists, expandHomePath, safeJsonParse, sessionKeyToContainerName } from '../../shared/utils.js';
import type { SandboxRegistryEntry, Instance, InstanceCreateInput, InstanceUpdateInput } from '../../shared/types.js';
import type { LoadedConfig } from '../../config/loader.js';
import { writeFile } from 'fs/promises';
import type { ContainerService } from './container.js';

export class InstanceService {
  private config: LoadedConfig;
  private containerService: ContainerService;

  constructor(config: LoadedConfig, containerService: ContainerService) {
    this.config = config;
    this.containerService = containerService;
  }

  /**
   * 获取注册表文件路径
   */
  private getRegistryPath(): string {
    return expandHomePath(this.config.openclaw.registryFile);
  }

  /**
   * 获取所有实例
   */
  async getInstances(): Promise<Instance[]> {
    const content = await readFileIfExists(this.getRegistryPath());
    if (!content) {
      return [];
    }

    const entries: SandboxRegistryEntry[] = safeJsonParse(content, []);
    const instances: Instance[] = [];

    for (const entry of entries) {
      const status = await this.containerService.getContainerStatus(entry.containerName);
      instances.push(this.mapToInstance(entry, status));
    }

    return instances;
  }

  /**
   * 根据 sessionKey 获取实例
   */
  async getInstanceBySessionKey(sessionKey: string): Promise<Instance | null> {
    const content = await readFileIfExists(this.getRegistryPath());
    if (!content) {
      return null;
    }

    const entries: SandboxRegistryEntry[] = safeJsonParse(content, []);
    const entry = entries.find((e) => e.sessionKey === sessionKey);

    if (!entry) {
      return null;
    }

    const status = await this.containerService.getContainerStatus(entry.containerName);
    return this.mapToInstance(entry, status);
  }

  /**
   * 创建新实例
   */
  async createInstance(input: InstanceCreateInput): Promise<Instance> {
    const containerName = sessionKeyToContainerName(input.sessionKey);

    // 创建 Docker 容器
    await this.containerService.createContainer({
      containerName,
      sessionKey: input.sessionKey,
      image: input.dockerImage || 'openclaw-sandbox:bookworm-slim',
      workdir: input.workdir,
      env: input.env,
      networkMode: input.networkMode || 'bridge',
      idleTimeoutHours: input.idleTimeoutHours || 24,
    });

    // 添加到注册表
    const entries = await this.getRegistryEntries();
    const now = Date.now();

    const newEntry: SandboxRegistryEntry = {
      containerName,
      sessionKey: input.sessionKey,
      createdAtMs: now,
      lastUsedAtMs: now,
      image: input.dockerImage || 'openclaw-sandbox:bookworm-slim',
    };

    entries.push(newEntry);
    await this.saveRegistryEntries(entries);

    return {
      id: containerName,
      sessionKey: input.sessionKey,
      displayName: input.displayName,
      containerName,
      status: 'stopped',
      image: input.dockerImage || 'openclaw-sandbox:bookworm-slim',
      createdAt: new Date(now).toISOString(),
      lastUsedAt: new Date(now).toISOString(),
      env: input.env,
      idleTimeoutHours: input.idleTimeoutHours,
      networkMode: input.networkMode,
      workdir: input.workdir,
    };
  }

  /**
   * 更新实例配置
   */
  async updateInstance(sessionKey: string, input: InstanceUpdateInput): Promise<Instance | null> {
    const instances = await this.getRegistryEntries();
    const index = instances.findIndex((e) => e.sessionKey === sessionKey);

    if (index === -1) {
      return null;
    }

    // 更新注册表中的基本信息
    if (input.env) {
      // 环境变量更新需要在容器创建时应用
      instances[index] = { ...instances[index] };
    }

    // 更新最后使用时间
    instances[index].lastUsedAtMs = Date.now();
    await this.saveRegistryEntries(instances);

    return this.getInstanceBySessionKey(sessionKey);
  }

  /**
   * 删除实例
   */
  async deleteInstance(sessionKey: string): Promise<boolean> {
    const instance = await this.getInstanceBySessionKey(sessionKey);
    if (!instance) {
      return false;
    }

    // 删除容器
    try {
      await this.containerService.removeContainer(instance.containerName);
    } catch {
      // 容器可能已经不存在，忽略错误
    }

    // 从注册表移除
    const entries = await this.getRegistryEntries();
    const filteredEntries = entries.filter((e) => e.sessionKey !== sessionKey);
    await this.saveRegistryEntries(filteredEntries);

    return true;
  }

  /**
   * 获取注册表条目
   */
  private async getRegistryEntries(): Promise<SandboxRegistryEntry[]> {
    const content = await readFileIfExists(this.getRegistryPath());
    if (!content) {
      return [];
    }
    return safeJsonParse(content, []);
  }

  /**
   * 保存注册表条目
   */
  private async saveRegistryEntries(entries: SandboxRegistryEntry[]): Promise<void> {
    const dir = expandHomePath(this.config.openclaw.configDir);
    const { ensureDir } = await import('../../shared/utils.js');
    await ensureDir(dir);
    await writeFile(this.getRegistryPath(), JSON.stringify(entries, null, 2), 'utf-8');
  }

  /**
   * 映射注册表条目到实例
   */
  private mapToInstance(entry: SandboxRegistryEntry, status: string): Instance {
    return {
      id: entry.containerName,
      sessionKey: entry.sessionKey,
      containerName: entry.containerName,
      status: status as Instance['status'],
      image: entry.image,
      createdAt: new Date(entry.createdAtMs).toISOString(),
      lastUsedAt: new Date(entry.lastUsedAtMs).toISOString(),
      configHash: entry.configHash,
    };
  }
}
