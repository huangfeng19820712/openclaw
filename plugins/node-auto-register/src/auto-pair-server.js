/**
 * OpenClaw Node Auto-Register - Control UI Auto-Pair Server
 *
 * 提供 HTTP API 用于 Control UI 自动配对
 *
 * API:
 *   GET  /plugins/node-auto-register/api/auto-pair?inviteCode=xxx
 *   POST /plugins/node-auto-register/api/auto-pair
 *
 * 工作流程:
 * 1. Control UI 加载时检测 URL 中的 inviteCode 参数
 * 2. 调用此 API 验证邀请码并自动批准配对
 * 3. 配对成功后刷新页面
 *
 * 用法 (在 plugin 中注册):
 *   import { registerAutoPairServer } from './auto-pair-server.js';
 *   registerAutoPairServer();
 */

import fs from 'node:fs';
import path from 'node:path';

// 引入 device-pairing 函数（在 Gateway 环境中可用）
let approveDevicePairing = null;
let listDevicePairing = null;

function initDevicePairing() {
  try {
    // 尝试从 plugin-sdk 导入
    const devicePair = require('openclaw/plugin-sdk/device-pair');
    approveDevicePairing = devicePair.approveDevicePairing;
    listDevicePairing = devicePair.listDevicePairing;
  } catch (err) {
    // 在非 plugin 环境中，尝试直接从源文件导入
    try {
      const infraPath = path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'dist', 'infra', 'device-pairing.js');
      const infra = require(infraPath);
      approveDevicePairing = infra.approveDevicePairing;
      listDevicePairing = infra.listDevicePairing;
    } catch (err2) {
      console.warn('[auto-pair] Could not import device-pairing functions:', err2.message);
    }
  }
}

// 初始化 device pairing 函数
initDevicePairing();

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
 * 验证邀请码是否有效
 */
function verifyInviteCode(inviteCode) {
  console.log('[auto-pair] Verifying invite code:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(empty)');

  if (!inviteCode || typeof inviteCode !== 'string') {
    console.log('[auto-pair] Invite code validation failed: invite code is required');
    return { valid: false, reason: 'invite code is required' };
  }

  const codes = loadInviteCodes();
  const now = Date.now();

  console.log('[auto-pair] Loaded invite codes from:', getInviteCodeFilePath());
  console.log('[auto-pair] Found', Object.keys(codes).length, 'invite code(s)');

  for (const [name, data] of Object.entries(codes)) {
    if (!data.active) {
      console.log('[auto-pair] Code "', name, '" skipped: not active');
      continue;
    }
    if (data.code !== inviteCode) {
      continue;
    }
    if (data.expiresAt < now) {
      console.log('[auto-pair] Code "', name, '" failed: expired at', new Date(data.expiresAt).toISOString());
      return { valid: false, reason: 'expired' };
    }
    if (data.usedCount >= data.maxUses) {
      console.log('[auto-pair] Code "', name, '" failed: max uses reached', data.usedCount, '/', data.maxUses);
      return { valid: false, reason: 'max_uses_reached' };
    }

    console.log('[auto-pair] Code "', name, '" validation successful');
    console.log('[auto-pair]   - Expires:', new Date(data.expiresAt).toISOString());
    console.log('[auto-pair]   - Max uses:', data.maxUses);
    console.log('[auto-pair]   - Current uses:', data.usedCount);

    return {
      valid: true,
      codeName: name,
      data: data,
    };
  }

  console.log('[auto-pair] No matching valid invite code found');
  return { valid: false, reason: 'invalid or expired invite code' };
}

/**
 * 增加邀请码使用次数
 */
function incrementInviteCodeUsage(codeName) {
  console.log('[auto-pair] Incrementing invite code usage for:', codeName);
  const codes = loadInviteCodes();
  if (codes[codeName]) {
    const oldCount = codes[codeName].usedCount || 0;
    codes[codeName].usedCount = oldCount + 1;
    const filePath = getInviteCodeFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(codes, null, 2), 'utf-8');
    console.log('[auto-pair] Invite code usage updated:', codeName, oldCount, '->', oldCount + 1);
    console.log('[auto-pair] Invite codes file saved to:', filePath);
  }
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
 * 处理自动配对请求
 */
async function handleAutoPair(req, res) {
  console.log('[auto-pair] === Auto-pair request received ===');
  console.log('[auto-pair] Method:', req.method);
  console.log('[auto-pair] URL:', req.url);

  // 只接受 GET 和 POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    console.log('[auto-pair] Rejected: Method not allowed:', req.method);
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  // 解析邀请码
  let inviteCode = null;

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    inviteCode = url.searchParams.get('inviteCode');
    console.log('[auto-pair] GET request, inviteCode from query:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(empty)');
  } else if (req.method === 'POST') {
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk.toString();
      }
      const data = JSON.parse(body);
      inviteCode = data.inviteCode;
      console.log('[auto-pair] POST request, inviteCode from body:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(empty)');
    } catch (err) {
      console.log('[auto-pair] Failed to parse POST body:', err.message);
      sendJson(res, 400, { ok: false, error: 'Invalid request body' });
      return;
    }
  }

  console.log('[auto-pair] Starting invite code validation...');

  // 验证邀请码
  const verification = verifyInviteCode(inviteCode);
  if (!verification.valid) {
    console.log('[auto-pair] Invite code validation failed:', verification.reason);
    sendJson(res, 401, {
      ok: false,
      error: verification.reason,
      codeName: verification.codeName
    });
    return;
  }

  console.log('[auto-pair] Invite code validation successful, code name:', verification.codeName);

  // 检查是否有待处理的配对请求
  if (!listDevicePairing) {
    console.log('[auto-pair] Error: device-pairing functions not available');
    sendJson(res, 500, { ok: false, error: 'device-pairing functions not available' });
    return;
  }

  console.log('[auto-pair] Fetching pending pairing requests...');
  const list = await listDevicePairing();

  console.log('[auto-pair] Found', list.pending.length, 'pending pairing request(s)');

  if (list.pending.length === 0) {
    // 没有待处理请求，可能已经配对过了
    console.log('[auto-pair] No pending requests, device may already be paired');
    sendJson(res, 200, { ok: true, alreadyPaired: true });
    return;
  }

  // 批准第一个待处理的请求
  const pending = list.pending[0];
  console.log('[auto-pair] Approving pending request:');
  console.log('[auto-pair]   - requestId:', pending.requestId);
  console.log('[auto-pair]   - deviceId:', pending.deviceId);
  console.log('[auto-pair]   - displayName:', pending.displayName || '(none)');

  const result = await approveDevicePairing(pending.requestId);

  if (result) {
    console.log('[auto-pair] Pairing approved successfully!');
    console.log('[auto-pair]   - deviceId:', result.device.deviceId);
    console.log('[auto-pair]   - displayName:', result.device.displayName || '(none)');

    // 增加邀请码使用次数
    incrementInviteCodeUsage(verification.codeName);

    console.log('[auto-pair] Sending success response');
    sendJson(res, 200, {
      ok: true,
      paired: true,
      deviceId: result.device.deviceId,
      deviceName: result.device.displayName,
    });
  } else {
    console.log('[auto-pair] Failed to approve pairing');
    sendJson(res, 500, { ok: false, error: 'Failed to approve pairing' });
  }

  console.log('[auto-pair] === Auto-pair request completed ===');
}

/**
 * 注册自动配对 HTTP 路由
 * @param {any} api - Plugin SDK API (passed from plugin register function)
 */
export function registerAutoPairServer(api) {
  console.log('[auto-pair] === Registering auto-pair server ===');

  if (!api) {
    console.error('[auto-pair] api is required - call registerAutoPairServer(api) from plugin register function');
    return null;
  }

  if (!api.registerHttpRoute) {
    console.error('[auto-pair] api.registerHttpRoute not available');
    return null;
  }

  // 使用 api.registerHttpRoute 而不是 registerPluginHttpRoute
  // 因为在 plugin register 阶段，全局 registry 还未激活
  api.registerHttpRoute({
    path: '/plugins/node-auto-register/api/auto-pair',
    auth: 'plugin',
    handler: handleAutoPair,
    match: 'exact',
  });

  console.log('[auto-pair] Server registered at /plugins/node-auto-register/api/auto-pair');
  console.log('[auto-pair] Endpoint URL: http://<gateway-host>:<gateway-port>/plugins/node-auto-register/api/auto-pair');
  console.log('[auto-pair] Example: GET /plugins/node-auto-register/api/auto-pair?inviteCode=xxx');
  console.log('[auto-pair] === Auto-pair server registration complete ===');

  // 返回一个空的清理函数（目前不需要特殊清理）
  return () => {
    console.log('[auto-pair] Server unregistered');
  };
}

// 导出工具函数
export { verifyInviteCode, loadInviteCodes, handleAutoPair };
