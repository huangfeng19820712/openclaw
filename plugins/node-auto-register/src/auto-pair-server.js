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
import { randomBytes } from 'node:crypto';

// 引入 plugin SDK（在 Gateway 环境中可用）
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
  if (!inviteCode || typeof inviteCode !== 'string') {
    return { valid: false, reason: 'invite code is required' };
  }

  const codes = loadInviteCodes();
  const now = Date.now();

  for (const [name, data] of Object.entries(codes)) {
    if (!data.active) continue;
    if (data.code !== inviteCode) continue;
    if (data.expiresAt < now) continue;
    if (data.usedCount >= data.maxUses) continue;

    return {
      valid: true,
      codeName: name,
      data: data,
    };
  }

  return { valid: false, reason: 'invalid or expired invite code' };
}

/**
 * 增加邀请码使用次数
 */
function incrementInviteCodeUsage(codeName) {
  const codes = loadInviteCodes();
  if (codes[codeName]) {
    codes[codeName].usedCount = (codes[codeName].usedCount || 0) + 1;
    const filePath = getInviteCodeFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(codes, null, 2), 'utf-8');
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
  // 只接受 GET 和 POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  // 解析邀请码
  let inviteCode = null;

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    inviteCode = url.searchParams.get('inviteCode');
  } else if (req.method === 'POST') {
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk.toString();
      }
      const data = JSON.parse(body);
      inviteCode = data.inviteCode;
    } catch (err) {
      sendJson(res, 400, { ok: false, error: 'Invalid request body' });
      return;
    }
  }

  // 验证邀请码
  const verification = verifyInviteCode(inviteCode);
  if (!verification.valid) {
    sendJson(res, 401, {
      ok: false,
      error: verification.reason,
      codeName: verification.codeName
    });
    return;
  }

  // 检查是否有待处理的配对请求
  if (!listDevicePairing) {
    sendJson(res, 500, { ok: false, error: 'device-pairing functions not available' });
    return;
  }

  const list = await listDevicePairing();

  if (list.pending.length === 0) {
    // 没有待处理请求，可能已经配对过了
    sendJson(res, 200, { ok: true, alreadyPaired: true });
    return;
  }

  // 批准第一个待处理的请求
  const pending = list.pending[0];
  const result = await approveDevicePairing(pending.requestId);

  if (result) {
    // 增加邀请码使用次数
    incrementInviteCodeUsage(verification.codeName);

    sendJson(res, 200, {
      ok: true,
      paired: true,
      deviceId: result.device.deviceId,
      deviceName: result.device.displayName,
    });
  } else {
    sendJson(res, 500, { ok: false, error: 'Failed to approve pairing' });
  }
}

/**
 * 注册自动配对 HTTP 路由
 */
export function registerAutoPairServer() {
  // 尝试注册 HTTP 路由
  let registerPluginHttpRoute = null;

  try {
    const pluginSdk = require('openclaw/plugin-sdk');
    registerPluginHttpRoute = pluginSdk.registerPluginHttpRoute;
  } catch (err) {
    console.warn('[auto-pair] Could not import registerPluginHttpRoute:', err.message);
    return null;
  }

  if (!registerPluginHttpRoute) {
    console.warn('[auto-pair] registerPluginHttpRoute not available');
    return null;
  }

  const unregister = registerPluginHttpRoute({
    path: '/plugins/node-auto-register/api/auto-pair',
    auth: 'none',
    handler: handleAutoPair,
    pluginId: 'node-auto-register',
    source: 'auto-pair-server.js',
  });

  console.log('[auto-pair] Server registered at /plugins/node-auto-register/api/auto-pair');
  return unregister;
}

// 导出工具函数
export { verifyInviteCode, loadInviteCodes, handleAutoPair };
