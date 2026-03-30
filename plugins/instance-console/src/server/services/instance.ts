import { spawn } from 'child_process';
import type { Instance, InstanceCreateInput, InstanceUpdateInput } from '../../shared/types.js';
import type { LoadedConfig } from '../../config/loader.js';
import type { ContainerService } from './container.js';

export class InstanceService {
  private config: LoadedConfig;
  private containerService: ContainerService;
  private readonly scriptPath = '/data/workspace/openclaw/docker-instance-setup.sh';

  constructor(config: LoadedConfig, containerService: ContainerService) {
    this.config = config;
    this.containerService = containerService;
  }

  /**
   * 执行 Shell 脚本
   */
  private async execScript(env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn('bash', [this.scriptPath], {
        env: { ...process.env, ...env },
        shell: false,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ code: code || 0, stdout, stderr });
      });

      proc.on('error', (err) => {
        stderr += err.message;
        resolve({ code: 1, stdout, stderr });
      });
    });
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
   * 创建新实例 - 调用 docker-instance-setup.sh 脚本
   */
  async createInstance(input: InstanceCreateInput): Promise<Instance> {
    const instanceId = input.sessionKey;

    // 调用 docker-instance-setup.sh 创建容器
    const env: Record<string, string> = {
      OPENCLAW_INSTANCE_ID: instanceId,
      OPENCLAW_NO_ONBOARD: 'true',
      OPENCLAW_SKIP_BUILD: 'true',
      OPENCLAW_IMAGE: input.dockerImage || 'openclaw:local',
    };

    // 如果指定了端口偏移
    if (input.portOffset !== undefined) {
      env.OPENCLAW_PORT_OFFSET = String(input.portOffset);
    }

    const result = await this.execScript(env);

    if (result.code !== 0) {
      throw new Error(`创建实例失败: ${result.stderr || result.stdout}`);
    }

    // 从输出中提取信息
    const now = new Date().toISOString();
    const containerName = `openclaw-${instanceId}-openclaw-gateway-1`;

    return {
      id: containerName,
      sessionKey: instanceId,
      displayName: input.displayName,
      containerName,
      status: 'running',
      image: input.dockerImage || 'openclaw:local',
      createdAt: now,
      lastUsedAt: now,
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
