import { spawn } from 'child_process';
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
    return new Promise((resolve) => {
      const proc = spawn('docker', args, {
        shell: true,
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
        resolve({ stdout, stderr, code: code || 0 });
      });

      proc.on('error', (err) => {
        stderr += err.message;
        resolve({ stdout, stderr, code: 1 });
      });
    });
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
      // 使用 docker ps --format 获取带有 openclaw.sandbox=1 标签的容器
      const { stdout, code } = await this.execDocker([
        'ps',
        '--filter', 'label=openclaw.sandbox=1',
        '--format', '{{.Names}}|{{.Status}}|{{.Image}}|{{.CreatedAt}}|{{.Labels}}'
      ]);

      if (code !== 0 || !stdout.trim()) {
        return [];
      }

      const containers = stdout.trim().split('\n').map(line => {
        const [name, status, image, createdAt, labelsStr] = line.split('|');
        const labels: Record<string, string> = {};

        // 解析 labels 字符串，格式如: "openclaw.sandbox=1,openclaw.sessionKey=test"
        if (labelsStr) {
          labelsStr.split(',').forEach(label => {
            const [key, value] = label.split('=');
            if (key && value !== undefined) {
              labels[key] = value;
            }
          });
        }

        return {
          name: name.trim(),
          status: status.trim(),
          image: image.trim(),
          createdAt: createdAt.trim(),
          labels,
        };
      });

      return containers;
    } catch {
      return [];
    }
  }
}
