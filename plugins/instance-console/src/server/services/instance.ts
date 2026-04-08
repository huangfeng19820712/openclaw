import { spawn } from 'child_process';
import type { Instance, InstanceCreateInput, InstanceUpdateInput } from '../../shared/types.js';
import type { LoadedConfig } from '../../config/loader.js';
import type { ContainerService } from './container.js';
import type { OperationLogService } from './operationLog.js';

// 创建任务状态
export interface CreateTask {
  id: string;
  instanceId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: string;
  result?: Instance;
  error?: string;
}

export class InstanceService {
  private config: LoadedConfig;
  private containerService: ContainerService;
  private operationLogService: OperationLogService;
  private readonly setupScriptPath = '/data/workspace/openclaw/docker-instance-setup.sh';
  private readonly deployWithInviteScriptPath = '/data/workspace/openclaw/deploy-instance-with-invite.sh';
  private readonly cleanupScriptPath = '/data/workspace/openclaw/cleanup-instance.sh';
  private readonly serverIp = '192.168.90.6';  // TODO: 动态获取服务器 IP

  // 创建任务存储
  private createTasks = new Map<string, CreateTask>();

  constructor(config: LoadedConfig, containerService: ContainerService, operationLogService: OperationLogService) {
    this.config = config;
    this.containerService = containerService;
    this.operationLogService = operationLogService;
  }

  /**
   * 执行 Shell 脚本
   * @param scriptPath 脚本路径
   * @param scriptArgs 脚本参数
   * @param env 环境变量
   */
  private async execScript(
    scriptPath: string,
    scriptArgs: string[] = [],
    env: Record<string, string> = {}
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn('bash', [scriptPath, ...scriptArgs], {
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

    const instances = await Promise.all(dockerContainers.map(async container => {
      const status = container.status.toLowerCase().startsWith('up') ? 'running' :
                     container.status.includes('exited') || container.status.includes('Created') ? 'stopped' : 'error';

      // 获取端口映射
      const ports = await this.containerService.getContainerPorts(container.name);

      return {
        id: container.name,
        sessionKey: container.labels['openclaw.sessionKey'] || this.extractInstanceIdFromContainerName(container.name),
        containerName: container.name,
        status: status as Instance['status'],
        image: container.image,
        createdAt: container.createdAt,
        lastUsedAt: container.labels['openclaw.lastUsedAtMs']
          ? new Date(parseInt(container.labels['openclaw.lastUsedAtMs'])).toISOString()
          : new Date().toISOString(),
        ports,
      };
    }));

    return instances;
  }

  /**
   * 从容器名提取 instance ID
   * 容器名格式: openclaw-{instance_id}-openclaw-gateway-1
   * 例如: openclaw-gw1-openclaw-gateway-1 -> gw1
   */
  private extractInstanceIdFromContainerName(containerName: string): string {
    // 如果有 openclaw.sessionKey 标签，使用它
    // 否则从容器名提取
    // 格式: openclaw-{instance_id}-openclaw-gateway-1
    const match = containerName.match(/^openclaw-(.+)-openclaw-gateway-1$/);
    if (match) {
      return match[1];
    }
    // 如果格式不匹配，返回原名
    return containerName;
  }

  /**
   * 根据 sessionKey 或容器名获取实例
   */
  async getInstanceBySessionKey(sessionKeyOrContainerName: string): Promise<Instance | null> {
    const containers = await this.containerService.listSandboxContainers();

    // 查找匹配的容器：支持三种方式
    // 1. 完整容器名 (openclaw-pro1-openclaw-gateway-1)
    // 2. openclaw.sessionKey 标签 (pro1)
    // 3. 从容器名提取的 instance ID (pro1)
    const container = containers.find(c =>
      c.name === sessionKeyOrContainerName ||
      c.labels['openclaw.sessionKey'] === sessionKeyOrContainerName ||
      this.extractInstanceIdFromContainerName(c.name) === sessionKeyOrContainerName
    );

    if (!container) {
      return null;
    }

    const status = container.status.toLowerCase().startsWith('up') ? 'running' :
                   container.status.includes('exited') || container.status.includes('Created') ? 'stopped' : 'error';

    // 获取端口映射
    const ports = await this.containerService.getContainerPorts(container.name);

    // 优先使用标签中的 sessionKey，其次从容器名提取，最后使用完整容器名
    const sessionKey = container.labels['openclaw.sessionKey'] ||
                       this.extractInstanceIdFromContainerName(container.name);

    return {
      id: container.name,
      sessionKey,
      containerName: container.name,
      status: status as Instance['status'],
      image: container.image,
      createdAt: container.createdAt,
      lastUsedAt: container.labels['openclaw.lastUsedAtMs']
        ? new Date(parseInt(container.labels['openclaw.lastUsedAtMs'])).toISOString()
        : new Date().toISOString(),
      ports,
    };
  }

  /**
   * 创建新实例 - 异步方式，后台执行脚本
   * 返回任务 ID，前端轮询获取进度
   */
  createInstance(input: InstanceCreateInput): { taskId: string } {
    const instanceId = input.sessionKey;
    const taskId = `create-${instanceId}-${Date.now()}`;

    // 创建任务
    const task: CreateTask = {
      id: taskId,
      instanceId,
      status: 'pending',
      progress: '准备创建...',
    };
    this.createTasks.set(taskId, task);

    // 后台执行脚本
    setImmediate(() => this.runCreateScript(taskId, input));

    // 立即返回任务 ID
    return { taskId };
  }

  /**
   * 后台执行创建脚本
   */
  private async runCreateScript(taskId: string, input: InstanceCreateInput): Promise<void> {
    const task = this.createTasks.get(taskId);
    if (!task) return;

    const instanceId = input.sessionKey;
    const containerName = `openclaw-${instanceId}-openclaw-gateway-1`;

    try {
      task.status = 'running';
      task.progress = '正在部署容器...';

      // 调用 deploy-instance-with-invite.sh（完整流程：创建容器、复制插件、重启、生成邀请码）
      const result = await this.execScript(this.deployWithInviteScriptPath, [instanceId]);

      if (result.code !== 0) {
        task.status = 'failed';
        task.error = result.stderr || result.stdout;
        await this.operationLogService.log('create', instanceId, 'instance', 'failed', task.error);
        return;
      }

      task.progress = '正在提取邀请码...';

      // 从输出中提取邀请码和访问 URL
      let inviteCode = '';
      let accessUrl = '';
      let gatewayPort = 18789;

      const codeMatch = result.stdout.match(/邀请码：\s*(\S+)/);
      if (codeMatch) {
        inviteCode = codeMatch[1];
      }

      const portMatch = result.stdout.match(/Gateway 端口：(\d+)/);
      if (portMatch) {
        gatewayPort = parseInt(portMatch[1], 10);
      }

      const urlMatch = result.stdout.match(/http:\/\/[^\s]+/);
      if (urlMatch) {
        accessUrl = urlMatch[0];
      } else if (inviteCode) {
        accessUrl = `http://${this.serverIp}:${gatewayPort}/?inviteCode=${inviteCode}&session=main`;
      }

      const now = new Date().toISOString();
      task.progress = '创建完成';
      task.status = 'completed';
      task.result = {
        id: containerName,
        sessionKey: instanceId,
        displayName: input.displayName,
        containerName,
        status: 'running',
        image: input.dockerImage || 'openclaw:local',
        createdAt: now,
        lastUsedAt: now,
        inviteCode,
        accessUrl,
        serverIp: this.serverIp,
        gatewayPort,
      };

      await this.operationLogService.log('create', instanceId, 'instance', 'success');
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      await this.operationLogService.log('create', instanceId, 'instance', 'failed', task.error);
    }
  }

  /**
   * 获取创建任务状态
   */
  getCreateTask(taskId: string): CreateTask | null {
    return this.createTasks.get(taskId) || null;
  }

  /**
   * 获取创建任务状态（兼容旧接口，通过 instanceId）
   */
  async getCreateTaskByInstanceId(instanceId: string): Promise<CreateTask | null> {
    for (const task of this.createTasks.values()) {
      if (task.instanceId === instanceId) {
        return task;
      }
    }
    return null;
  }

  /**
   * 更新实例配置
   */
  async updateInstance(sessionKey: string, input: InstanceUpdateInput): Promise<Instance | null> {
    return this.getInstanceBySessionKey(sessionKey);
  }

  /**
   * 删除实例 - 调用 cleanup-instance.sh 脚本
   */
  async deleteInstance(sessionKey: string): Promise<boolean> {
    const instance = await this.getInstanceBySessionKey(sessionKey);
    if (!instance) {
      return false;
    }

    // 调用 cleanup-instance.sh 删除实例（使用 --force 跳过确认）
    // 注意：cleanup-script 需要 instance_id (如 gw1)，不是完整的容器名
    // 从容器名提取真正的 instance_id（容器名格式: openclaw-{instance_id}-openclaw-gateway-1）
    const instanceId = this.extractInstanceIdFromContainerName(instance.containerName);
    const result = await this.execScript(this.cleanupScriptPath, ['--force', instanceId]);

    if (result.code !== 0) {
      await this.operationLogService.log('delete', instanceId, 'instance', 'failed', result.stderr || result.stdout);
      throw new Error(`删除实例失败: ${result.stderr || result.stdout}`);
    }

    await this.operationLogService.log('delete', instanceId, 'instance', 'success');
    return true;
  }

}
