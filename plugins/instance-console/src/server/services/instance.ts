import { sessionKeyToContainerName } from '../../shared/utils.js';
import type { Instance, InstanceCreateInput, InstanceUpdateInput } from '../../shared/types.js';
import type { LoadedConfig } from '../../config/loader.js';
import type { ContainerService } from './container.js';

export class InstanceService {
  private config: LoadedConfig;
  private containerService: ContainerService;

  constructor(config: LoadedConfig, containerService: ContainerService) {
    this.config = config;
    this.containerService = containerService;
  }

  /**
   * 获取所有实例
   */
  async getInstances(): Promise<Instance[]> {
    const dockerContainers = await this.containerService.listSandboxContainers();

    return dockerContainers.map(container => {
      const status = container.status.toLowerCase().startsWith('up') ? 'running' :
                     container.status.includes('exited') || container.status.includes('Created') ? 'stopped' : 'error';

      return {
        id: container.name,
        sessionKey: container.labels['openclaw.sessionKey'] || container.name,
        containerName: container.name,
        status: status as Instance['status'],
        image: container.image,
        createdAt: container.createdAt,
        lastUsedAt: container.labels['openclaw.lastUsedAtMs']
          ? new Date(parseInt(container.labels['openclaw.lastUsedAtMs'])).toISOString()
          : new Date().toISOString(),
      };
    });
  }

  /**
   * 根据 sessionKey 或容器名获取实例
   */
  async getInstanceBySessionKey(sessionKeyOrContainerName: string): Promise<Instance | null> {
    const containers = await this.containerService.listSandboxContainers();
    // 直接用传入的值当作容器名查找（因为容器名和sessionKey都是直接可用的）
    const container = containers.find(c =>
      c.name === sessionKeyOrContainerName ||
      c.labels['openclaw.sessionKey'] === sessionKeyOrContainerName
    );

    if (!container) {
      return null;
    }

    const status = container.status.toLowerCase().startsWith('up') ? 'running' :
                   container.status.includes('exited') || container.status.includes('Created') ? 'stopped' : 'error';

    return {
      id: container.name,
      sessionKey: container.labels['openclaw.sessionKey'] || container.name,
      containerName: container.name,
      status: status as Instance['status'],
      image: container.image,
      createdAt: container.createdAt,
      lastUsedAt: container.labels['openclaw.lastUsedAtMs']
        ? new Date(parseInt(container.labels['openclaw.lastUsedAtMs'])).toISOString()
        : new Date().toISOString(),
    };
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

    const now = new Date().toISOString();

    return {
      id: containerName,
      sessionKey: input.sessionKey,
      displayName: input.displayName,
      containerName,
      status: 'stopped',
      image: input.dockerImage || 'openclaw-sandbox:bookworm-slim',
      createdAt: now,
      lastUsedAt: now,
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

    try {
      await this.containerService.removeContainer(instance.containerName);
    } catch {
      // 容器可能已经不存在
    }

    return true;
  }
}
