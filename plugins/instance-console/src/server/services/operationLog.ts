import { spawn } from 'child_process';
import type { LoadedConfig } from '../../config/loader.js';

export interface OperationLog {
  id: string;
  action: 'start' | 'stop' | 'restart' | 'create' | 'delete' | 'update';
  target: string;
  targetType: 'instance' | 'container';
  result: 'success' | 'failed';
  message?: string;
  operator?: string;
  timestamp: string;
}

export class OperationLogService {
  private logs: OperationLog[] = [];
  private readonly maxLogs = 1000;
  private readonly logFile: string;

  constructor(config: LoadedConfig) {
    // 日志文件存储在配置目录下
    this.logFile = `${config.configDir}/operation_logs.json`;
  }

  private generateId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private async persistLogs(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const dir = path.dirname(this.logFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.logFile, JSON.stringify(this.logs.slice(0, this.maxLogs), null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to persist operation logs:', e);
    }
  }

  async log(
    action: OperationLog['action'],
    target: string,
    targetType: OperationLog['targetType'],
    result: OperationLog['result'],
    message?: string,
    operator?: string
  ): Promise<void> {
    const entry: OperationLog = {
      id: this.generateId(),
      action,
      target,
      targetType,
      result,
      message,
      operator,
      timestamp: new Date().toISOString(),
    };

    this.logs.unshift(entry);

    // 保持日志数量在限制内
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // 异步持久化
    this.persistLogs().catch(() => {});

    console.log(`[OperationLog] ${action} ${targetType} "${target}": ${result}${message ? ` - ${message}` : ''}`);
  }

  async getLogs(limit: number = 100, offset: number = 0): Promise<{ logs: OperationLog[]; total: number }> {
    const paginatedLogs = this.logs.slice(offset, offset + limit);
    return {
      logs: paginatedLogs,
      total: this.logs.length,
    };
  }

  async clearLogs(): Promise<void> {
    this.logs = [];
    await this.persistLogs();
  }
}
