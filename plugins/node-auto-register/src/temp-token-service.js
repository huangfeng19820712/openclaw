/**
 * OpenClaw Node Auto-Register - Temporary Token Service
 *
 * 提供一次性临时凭证的生成和验证功能
 * - 临时凭证 5 分钟有效
 * - 一次性使用（验证后立即删除）
 * - 内存存储（服务重启后自动清空）
 */

// 内存存储临时凭证
const tempTokenStore = new Map();

// 临时凭证有效期（5 分钟）
const TEMP_TOKEN_TTL_MS = 5 * 60 * 1000;

// 清理过期 token 的间隔（1 分钟）
const CLEANUP_INTERVAL_MS = 60 * 1000;

/**
 * 生成临时凭证
 * @returns {string} 临时凭证
 */
export function generateTempToken() {
  const token = cryptoRandomHex(32);
  const now = Date.now();

  tempTokenStore.set(token, {
    createdAt: now,
    expiresAt: now + TEMP_TOKEN_TTL_MS,
    used: false,
  });

  console.log('[temp-token] Generated temp token:', token.substring(0, 8) + '...', 'expires in 5 minutes');

  return token;
}

/**
 * 验证临时凭证
 * @param {string} tempToken - 临时凭证
 * @returns {{ valid: boolean, reason?: string }} 验证结果
 */
export function verifyTempToken(tempToken) {
  if (!tempToken) {
    return { valid: false, reason: 'tempToken is required' };
  }

  const record = tempTokenStore.get(tempToken);
  if (!record) {
    console.log('[temp-token] Token not found:', tempToken.substring(0, 8) + '...');
    return { valid: false, reason: 'invalid or expired tempToken' };
  }

  const now = Date.now();
  if (record.expiresAt < now) {
    console.log('[temp-token] Token expired:', tempToken.substring(0, 8) + '...');
    tempTokenStore.delete(tempToken);
    return { valid: false, reason: 'tempToken expired' };
  }

  if (record.used) {
    console.log('[temp-token] Token already used:', tempToken.substring(0, 8) + '...');
    tempTokenStore.delete(tempToken);
    return { valid: false, reason: 'tempToken already used' };
  }

  // 验证成功，标记为已使用并删除
  record.used = true;
  tempTokenStore.delete(tempToken);

  console.log('[temp-token] Token verified successfully:', tempToken.substring(0, 8) + '...');
  return { valid: true };
}

/**
 * 获取临时凭证剩余有效时间（秒）
 * @param {string} tempToken - 临时凭证
 * @returns {number} 剩余秒数
 */
export function getTempTokenRemainingSeconds(tempToken) {
  const record = tempTokenStore.get(tempToken);
  if (!record) {
    return 0;
  }
  const remaining = record.expiresAt - Date.now();
  return Math.max(0, Math.floor(remaining / 1000));
}

/**
 * 清理过期的临时凭证
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  let cleaned = 0;

  for (const [token, record] of tempTokenStore.entries()) {
    if (record.expiresAt < now) {
      tempTokenStore.delete(token);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log('[temp-token] Cleaned up', cleaned, 'expired token(s)');
  }
}

/**
 * 启动定期清理任务
 */
export function startCleanupTask() {
  const cleanupId = setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL_MS);
  console.log('[temp-token] Cleanup task started, running every 60 seconds');

  return () => {
    clearInterval(cleanupId);
    console.log('[temp-token] Cleanup task stopped');
  };
}

/**
 * 获取临时凭证存储统计信息
 * @returns {{ total: number, used: number, unused: number }}
 */
export function getTempTokenStats() {
  let used = 0;
  let unused = 0;

  for (const [, record] of tempTokenStore.entries()) {
    if (record.used) {
      used++;
    } else {
      unused++;
    }
  }

  return {
    total: used + unused,
    used,
    unused,
  };
}

/**
 * 加密安全的随机数生成
 * @param {number} bytes - 字节数
 * @returns {string} 十六进制字符串
 */
function cryptoRandomHex(bytes) {
  const crypto = require('node:crypto');
  return crypto.randomBytes(bytes).toString('hex');
}

// 启动时自动开始清理任务
startCleanupTask();
