/**
 * OpenClaw Node Auto-Register - Invite-Pair Server
 *
 * 提供 HTTP API 用于获取临时凭证（tempToken）
 *
 * API:
 *   GET /plugins/node-auto-register/api/invite-pair?inviteCode=xxx
 *
 * 工作流程:
 * 1. 验证 inviteCode 有效性
 * 2. 生成一次性 tempToken（5 分钟有效）
 * 3. 返回 tempToken 给客户端
 *
 * 用法 (在 plugin 中注册):
 *   import { registerInvitePairServer } from './invite-pair-server.js';
 *   registerInvitePairServer(api);
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateTempToken, getTempTokenRemainingSeconds } from './temp-token-service.js';

/**
 * 获取邀请码文件路径
 */
function getInviteCodeFilePath() {
  const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw');
  return path.join(openclawDir, 'invite-codes.json');
}

/**
 * 读取邀请码列表
 */
function loadInviteCodes() {
  const filePath = getInviteCodeFilePath();
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

/**
 * 验证邀请码是否有效（不增加使用次数）
 */
function verifyInviteCode(inviteCode) {
  console.log('[invite-pair] Verifying invite code:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(empty)');

  if (!inviteCode || typeof inviteCode !== 'string') {
    console.log('[invite-pair] Invite code validation failed: invite code is required');
    return { valid: false, reason: 'invite code is required' };
  }

  const codes = loadInviteCodes();
  const now = Date.now();

  console.log('[invite-pair] Loaded invite codes from:', getInviteCodeFilePath());
  console.log('[invite-pair] Found', Object.keys(codes).length, 'invite code(s)');

  for (const [name, data] of Object.entries(codes)) {
    if (!data.active) {
      console.log('[invite-pair] Code "', name, '" skipped: not active');
      continue;
    }
    if (data.code !== inviteCode) {
      continue;
    }
    if (data.expiresAt < now) {
      console.log('[invite-pair] Code "', name, '" failed: expired at', new Date(data.expiresAt).toISOString());
      return { valid: false, reason: 'expired' };
    }
    if (data.usedCount >= data.maxUses) {
      console.log('[invite-pair] Code "', name, '" failed: max uses reached', data.usedCount, '/', data.maxUses);
      return { valid: false, reason: 'max_uses_reached' };
    }

    console.log('[invite-pair] Code "', name, '" validation successful');
    console.log('[invite-pair]   - Expires:', new Date(data.expiresAt).toISOString());
    console.log('[invite-pair]   - Max uses:', data.maxUses);
    console.log('[invite-pair]   - Current uses:', data.usedCount);

    return {
      valid: true,
      codeName: name,
      data: data,
    };
  }

  console.log('[invite-pair] No matching valid invite code found');
  return { valid: false, reason: 'invalid or expired invite code' };
}

/**
 * 发送 JSON 响应
 */
function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(JSON.stringify(body));
}

/**
 * 处理临时凭证获取请求
 */
function handleInvitePair(req, res) {
  console.log('[invite-pair] === Invite-pair request received ===');
  console.log('[invite-pair] Method:', req.method);
  console.log('[invite-pair] URL:', req.url);

  // 只接受 GET 请求
  if (req.method !== 'GET') {
    console.log('[invite-pair] Rejected: Method not allowed:', req.method);
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  // 解析邀请码
  const url = new URL(req.url, 'http://localhost');
  const inviteCode = url.searchParams.get('inviteCode');

  console.log('[invite-pair] GET request, inviteCode:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(empty)');

  if (!inviteCode) {
    console.log('[invite-pair] Missing inviteCode parameter');
    sendJson(res, 400, { ok: false, error: 'inviteCode is required' });
    return;
  }

  // 验证邀请码
  const verification = verifyInviteCode(inviteCode);
  if (!verification.valid) {
    console.log('[invite-pair] Invite code validation failed:', verification.reason);
    sendJson(res, 401, {
      ok: false,
      error: verification.reason,
      codeName: verification.codeName
    });
    return;
  }

  console.log('[invite-pair] Invite code validation successful, generating tempToken...');

  // 生成临时凭证
  const tempToken = generateTempToken();
  const expiresInSeconds = Math.floor(getTempTokenRemainingSeconds(tempToken));

  console.log('[invite-pair] tempToken generated, expires in', expiresInSeconds, 'seconds');

  sendJson(res, 200, {
    ok: true,
    tempToken: tempToken,
    expiresInSeconds: expiresInSeconds,
  });

  console.log('[invite-pair] === Invite-pair request completed ===');
}

/**
 * 注册临时凭证 HTTP 路由
 * @param {any} api - Plugin SDK API
 */
export function registerInvitePairServer(api) {
  console.log('[invite-pair] === Registering invite-pair server ===');

  if (!api) {
    console.error('[invite-pair] api is required - call registerInvitePairServer(api) from plugin register function');
    return null;
  }

  if (!api.registerHttpRoute) {
    console.error('[invite-pair] api.registerHttpRoute not available');
    return null;
  }

  api.registerHttpRoute({
    path: '/plugins/node-auto-register/api/invite-pair',
    auth: 'plugin',
    handler: handleInvitePair,
    match: 'exact',
  });

  console.log('[invite-pair] Server registered at /plugins/node-auto-register/api/invite-pair');
  console.log('[invite-pair] Endpoint URL: http://<gateway-host>:<gateway-port>/plugins/node-auto-register/api/invite-pair');
  console.log('[invite-pair] Example: GET /plugins/node-auto-register/api/invite-pair?inviteCode=xxx');
  console.log('[invite-pair] === Invite-pair server registration complete ===');

  // 返回清理函数
  return () => {
    console.log('[invite-pair] Server unregistered');
  };
}

// 导出工具函数
export { verifyInviteCode, loadInviteCodes, handleInvitePair };
