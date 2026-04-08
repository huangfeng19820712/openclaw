import { spawn } from 'child_process';
import type { Instance, InstanceCreateInput, InstanceUpdateInput } from '../../shared/types.js';
import type { LoadedConfig } from '../../config/loader.js';
import type { ContainerService } from './container.js';
import type { OperationLogService } from './operationLog.js';

export class InstanceService {
  private config: LoadedConfig;
  private containerService: ContainerService;
  private operationLogService: OperationLogService;
  private readonly setupScriptPath = '/data/workspace/openclaw/docker-instance-setup.sh';
  private readonly deployWithInviteScriptPath = '/data/workspace/openclaw/deploy-instance-with-invite.sh';
  private readonly cleanupScriptPath = '/data/workspace/openclaw/cleanup-instance.sh';
  private readonly serverIp = '192.168.90.6';  // TODO: 动态获取服务器 IP

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
   * 创建新实例 - 调用 deploy-instance-with-invite.sh 脚本（完整流程）
   */
  async createInstance(input: InstanceCreateInput): Promise<Instance> {
    const instanceId = input.sessionKey;
    const containerName = `openclaw-${instanceId}-openclaw-gateway-1`;

    // 调用 deploy-instance-with-invite.sh（完整流程：创建容器、复制插件、重启、生成邀请码）
    const result = await this.execScript(this.deployWithInviteScriptPath, [instanceId]);

    if (result.code !== 0) {
      await this.operationLogService.log('create', instanceId, 'instance', 'failed', result.stderr || result.stdout);
      throw new Error(`创建实例失败: ${result.stderr || result.stdout}`);
    }

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
    await this.operationLogService.log('create', instanceId, 'instance', 'success');

    return {
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
