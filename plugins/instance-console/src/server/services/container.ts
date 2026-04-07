import { execCommand, formatBytes, parseDfOutput, parseFreeOutput } from '../../shared/utils.js';
import type { ContainerLogs } from '../../shared/types.js';

export interface CreateContainerParams {
  containerName: string;
  sessionKey: string;
  image: string;
  workdir?: string;
  env?: Record<string, string>;
  networkMode?: string;
  idleTimeoutHours?: number;
}

export class ContainerService {
  /**
   * 执行 Docker 命令
   */
  private async execDocker(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return execCommand('docker', args);
  }

  /**
   * 获取容器状态
   */
  async getContainerStatus(containerName: string): Promise<string> {
    try {
      const { stdout, code } = await this.execDocker(['ps', '-a', '--filter', `name=${containerName}`, '--format', '{{.Status}}']);
      if (code !== 0 || !stdout.trim()) {
        return 'unknown';
      }
      const status = stdout.trim().toLowerCase();
      if (status.startsWith('up')) {
        return 'running';
      }
      if (status.includes('exited')) {
        return 'stopped';
      }
      if (status.includes('created')) {
        return 'stopped';
      }
      return 'error';
    } catch {
      return 'unknown';
    }
  }

  /**
   * 创建容器
   */
  async createContainer(params: CreateContainerParams): Promise<void> {
    const args = [
      'create',
      '--name', params.containerName,
      '--label', 'openclaw.sandbox=1',
      '--label', `openclaw.sessionKey=${params.sessionKey}`,
      '--label', `openclaw.createdAtMs=${Date.now()}`,
      '--security-opt', 'no-new-privileges',
      '--cap-drop', 'ALL',
      '--network', params.networkMode || 'bridge',
      '-d', // 后台运行
    ];

    // 添加环境变量
    if (params.env) {
      for (const [key, value] of Object.entries(params.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // 添加工作目录
    if (params.workdir) {
      args.push('-w', params.workdir);
    }

    // 添加镜像
    args.push(params.image);

    const { code, stderr } = await this.execDocker(args);
    if (code !== 0) {
      throw new Error(`创建容器失败: ${stderr}`);
    }
  }

  /**
   * 启动容器
   */
  async startContainer(containerName: string): Promise<void> {
    const { code, stderr } = await this.execDocker(['start', containerName]);
    if (code !== 0) {
      throw new Error(`启动容器失败: ${stderr}`);
    }
  }

  /**
   * 停止容器
   */
  async stopContainer(containerName: string): Promise<void> {
    const { code, stderr } = await this.execDocker(['stop', containerName]);
    if (code !== 0) {
      throw new Error(`停止容器失败: ${stderr}`);
    }
  }

  /**
   * 重启容器
   */
  async restartContainer(containerName: string): Promise<void> {
    const { code, stderr } = await this.execDocker(['restart', containerName]);
    if (code !== 0) {
      throw new Error(`重启容器失败: ${stderr}`);
    }
  }

  /**
   * 删除容器
   */
  async removeContainer(containerName: string): Promise<void> {
    // 先强制停止（如果运行中）
    await this.stopContainer(containerName).catch(() => {
      // 忽略停止错误
    });

    const { code, stderr } = await this.execDocker(['rm', containerName]);
    if (code !== 0 && !stderr.includes('No such container')) {
      throw new Error(`删除容器失败: ${stderr}`);
    }
  }

  /**
   * 获取容器日志
   */
  async getContainerLogs(containerName: string, tail: number = 100): Promise<ContainerLogs> {
    const { stdout, stderr, code } = await this.execDocker(['logs', '--tail', String(tail), containerName]);
    return {
      name: containerName,
      logs: code === 0 ? stdout + stderr : `获取日志失败: ${stderr}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 检查 Docker 是否可用
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      const { code } = await this.execDocker(['version', '--format', '{{.Server.Version}}']);
      return code === 0;
    } catch {
      return false;
    }
  }

  /**
   * 获取容器端口映射
   * @returns 格式: { "18789/tcp": "0.0.0.0:18889", "18790/tcp": "0.0.0.0:18890" }
   */
  async getContainerPorts(containerName: string): Promise<Record<string, string>> {
    try {
      const { stdout, code } = await this.execDocker(['port', containerName]);
      if (code !== 0 || !stdout.trim()) {
        return {};
      }

      const ports: Record<string, string> = {};
      stdout.trim().split('\n').forEach(line => {
        // 格式: 18789/tcp -> 0.0.0.0:18889
        const match = line.match(/^(\d+\/\w+)\s*->\s*(.+)$/);
        if (match) {
          ports[match[1]] = match[2];
        }
      });

      return ports;
    } catch {
      return {};
    }
  }

  /**
   * 获取 Docker 系统信息
   */
  async getDockerInfo(): Promise<{
    version: string;
    containers: number;
    running: number;
    stopped: number;
  } | null> {
    try {
      const versionResult = await this.execDocker(['version', '--format', '{{.Server.Version}}']);
      const psResult = await this.execDocker(['ps', '-a', '--format', '{{.Status}}']);

      if (versionResult.code !== 0) {
        return null;
      }

      const statusLines = psResult.stdout.trim().split('\n').filter(l => l);
      let running = 0, stopped = 0;
      for (const status of statusLines) {
        if (status.startsWith('Up')) running++;
        else if (status) stopped++;
      }

      return {
        version: versionResult.stdout.trim(),
        containers: statusLines.length,
        running,
        stopped,
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取磁盘使用信息
   */
  async getDiskUsage(): Promise<{
    total: number;
    used: number;
    available: number;
    percent: number;
  } | null> {
    try {
      const { stdout } = await execCommand('df', ['-B1', '/']);
      return parseDfOutput(stdout);
    } catch {
      return null;
    }
  }

  /**
   * 获取内存使用信息
   */
  async getMemoryUsage(): Promise<{
    total: number;
    used: number;
    available: number;
    percent: number;
  } | null> {
    try {
      const { stdout } = await execCommand('free', ['-b']);
      return parseFreeOutput(stdout);
    } catch {
      return null;
    }
  }

  /**
   * 从 Docker 直接列出所有 OpenClaw 沙箱容器
   */
  async listSandboxContainers(): Promise<Array<{
    name: string;
    status: string;
    image: string;
    createdAt: string;
    labels: Record<string, string>;
  }>> {
    try {
      // 直接获取所有容器，然后按镜像名称过滤
      const result = await this.execDocker([
        'ps', '-a',
        '--format', '{{.Names}}|{{.Status}}|{{.Image}}|{{.CreatedAt}}|{{.Labels}}'
      ]);

      let stdout = result.stdout;

      if (!stdout.trim()) {
        return [];
      }

      const containers = stdout.trim().split('\n').map(line => {
        const parts = line.split('|');
        const name = parts[0]?.trim() || '';
        const status = parts[1]?.trim() || '';
        const image = parts[2]?.trim() || '';
        const createdAt = parts[3]?.trim() || '';
        const labelsStr = parts[4]?.trim() || '';

        const labels: Record<string, string> = {};

        // 解析 labels 字符串
        if (labelsStr) {
          labelsStr.split(',').forEach(label => {
            const [key, value] = label.split('=');
            if (key && value !== undefined) {
              labels[key] = value;
            }
          });
        }

        // 从容器名称推断 sessionKey
        if (name.startsWith('openclaw-sbx-')) {
          labels['openclaw.sandbox'] = '1';
          labels['openclaw.sessionKey'] = name.replace('openclaw-sbx-', '');
        }

        return {
          name,
          status,
          image,
          createdAt,
          labels,
        };
      });

      // 过滤出 OpenClaw 相关的容器（通过镜像名称）
      return containers.filter(c =>
        c.labels['openclaw.sandbox'] === '1' ||
        c.image === 'openclaw:local' ||
        c.image.includes('openclaw')
      );
    } catch (e) {
      console.error('listSandboxContainers error:', e);
      return [];
    }
  }
}
