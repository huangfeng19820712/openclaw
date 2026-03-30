import { v4 as uuidv4 } from 'uuid';

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
