import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import type { SpawnOptions } from 'child_process';

/**
 * 生成 UUID v4
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * 生成 API Key 格式: icak_<base64>
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'icak_';
  for (let i = 0; i < 24; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * 展开路径中的 ~ 为用户目录
 */
export function expandHomePath(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace('~', process.env.HOME || process.env.USERPROFILE || '~');
  }
  return path;
}

/**
 * 格式化时间戳为 ISO 字符串
 */
export function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * 从时间戳获取相对时间描述
 */
export function getRelativeTime(ms: number): string {
  const now = Date.now();
  const diff = now - ms;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  if (minutes > 0) return `${minutes} 分钟前`;
  return '刚刚';
}

/**
 * 将 sessionKey 转换为合法的容器名称
 */
export function sessionKeyToContainerName(sessionKey: string): string {
  const prefix = 'openclaw-sbx-';
  const slugified = sessionKey
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const maxLength = 63 - prefix.length;
  const truncated = slugified.slice(0, maxLength);
  return `${prefix}${truncated}`;
}

/**
 * 简单的密码验证
 */
export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: '密码长度至少为 8 个字符' };
  }
  return { valid: true };
}

/**
 * 等待指定毫秒
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 安全解析 JSON
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * 异步读取文件，如果不存在返回 null
 */
export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 确保目录存在
 */
export async function ensureDir(dirPath: string): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const resolvedPath = expandHomePath(dirPath);
  try {
    await fs.mkdir(resolvedPath, { recursive: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * 获取文件 modification time
 */
export async function getFileMtime(filePath: string): Promise<number | null> {
  try {
    const fs = await import('fs/promises');
    const stats = await fs.stat(filePath);
    return stats.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * 执行 Shell 命令的公共方法
 */
export async function execCommand(
  command: string,
  args: string[],
  options?: SpawnOptions
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      shell: false,
      windowsHide: true,
      ...options,
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
 * 格式化字节数为可读字符串
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 解析 df 命令输出获取磁盘使用情况
 */
export function parseDfOutput(output: string): { total: number; used: number; available: number; percent: number } | null {
  const lines = output.trim().split('\n');
  if (lines.length < 2) return null;

  const parts = lines[1].split(/\s+/);
  const total = parseInt(parts[1]) || 0;
  const used = parseInt(parts[2]) || 0;
  const available = parseInt(parts[3]) || 0;
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;

  return { total, used, available, percent };
}

/**
 * 解析 free 命令输出获取内存使用情况
 */
export function parseFreeOutput(output: string): { total: number; used: number; available: number; percent: number } | null {
  const lines = output.trim().split('\n');
  if (lines.length < 2) return null;

  const parts = lines[1].split(/\s+/);
  const total = parseInt(parts[1]) || 0;
  const used = parseInt(parts[2]) || 0;
  const available = parseInt(parts[3]) || 0;
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;

  return { total, used, available, percent };
}
