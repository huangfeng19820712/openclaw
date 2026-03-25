/**
 * OpenClaw Node Auto-Register - One-Shot Pair Server
 *
 * 提供 HTTP API 用于一键完成设备配对（无需 WebSocket 连接）
 *
 * API:
 *   GET /plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx
 *
 * 工作流程:
 * 1. 验证 inviteCode 有效性
 * 2. 生成虚拟设备信息
 * 3. 创建配对请求（直接写入 devices/pending.json）
 * 4. 调用 approveDevicePairing(requestId, baseDir) 批准配对
 * 5. 返回设备 token 给客户端
 *
 * 用法 (在 plugin 中注册):
 *   import { registerOneShotPairServer } from './one-shot-pair-server.js';
 *   registerOneShotPairServer(api);
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// 引入 approveDevicePairing 函数
let approveDevicePairing = null;

function initDevicePairing() {
  try {
    // 尝试从 plugin-sdk 导入（只导出 approveDevicePairing 和 listDevicePairing）
    const devicePair = require('openclaw/plugin-sdk/device-pair');
    approveDevicePairing = devicePair.approveDevicePairing;
  } catch (err) {
    // 尝试从源文件导入
    try {
      const infraPath = path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'dist', 'infra', 'device-pairing.js');
      const infra = require(infraPath);
      approveDevicePairing = infra.approveDevicePairing;
    } catch (err2) {
      console.warn('[one-shot-pair] Could not import approveDevicePairing:', err2.message);
    }
  }
}

// 初始化 device pairing 函数
initDevicePairing();

/**
 * 获取 device-pairing 状态文件路径（与 OpenClaw 核心保持一致）
 * 返回两个独立文件路径：pending.json 和 paired.json
 */
function getDevicePairingPaths() {
  const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw');
  const devicesDir = path.join(openclawDir, 'devices');
  return {
    dir: devicesDir,
    pendingPath: path.join(devicesDir, 'pending.json'),
    pairedPath: path.join(devicesDir, 'paired.json'),
  };
}

/**
 * 加载 pending 配对请求
 */
function loadPendingRequests() {
  const { pendingPath } = getDevicePairingPaths();
  try {
    const data = fs.readFileSync(pendingPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

/**
 * 保存 pending 配对请求（原子写入）
 */
function savePendingRequests(pendingById) {
  const { pendingPath } = getDevicePairingPaths();
  const dir = path.dirname(pendingPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // 原子写入：先写临时文件，再重命名
  const tmpPath = pendingPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(pendingById, null, 2), 'utf-8');
  fs.renameSync(tmpPath, pendingPath);
}

/**
 * 创建配对请求（写入 pending.json）
 * 由于 requestDevicePairing 未导出，我们直接操作状态文件
 */
function createPairingRequest(deviceInfo) {
  const pendingById = loadPendingRequests();
  const requestId = `req-${Date.now()}-${randomUUID().substring(0, 8)}`;

  const now = Date.now();
  const pendingRequest = {
    requestId,
    deviceId: deviceInfo.deviceId,
    publicKey: deviceInfo.publicKey,
    displayName: deviceInfo.displayName,
    platform: deviceInfo.platform,
    deviceFamily: deviceInfo.deviceFamily,
    clientId: deviceInfo.clientId,
    clientMode: deviceInfo.clientMode,
    role: deviceInfo.role,
    roles: deviceInfo.role ? [deviceInfo.role] : undefined,
    scopes: deviceInfo.scopes,
    silent: true, // 静默模式，不需要用户手动批准
    isRepair: false,
    ts: now,
  };

  pendingById[requestId] = pendingRequest;
  savePendingRequests(pendingById);

  console.log('[one-shot-pair] Pairing request created in pending.json:', requestId);
  console.log('[one-shot-pair] Pending file path:', getDevicePairingPaths().pendingPath);

  return {
    status: 'pending',
    request: pendingRequest,
    created: true,
  };
}

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
  console.log('[one-shot-pair] Verifying invite code:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(empty)');

  if (!inviteCode || typeof inviteCode !== 'string') {
    console.log('[one-shot-pair] Invite code validation failed: invite code is required');
    return { valid: false, reason: 'invite code is required' };
  }

  const codes = loadInviteCodes();
  const now = Date.now();

  console.log('[one-shot-pair] Loaded invite codes from:', getInviteCodeFilePath());
  console.log('[one-shot-pair] Found', Object.keys(codes).length, 'invite code(s)');

  for (const [name, data] of Object.entries(codes)) {
    if (!data.active) {
      console.log('[one-shot-pair] Code "', name, '" skipped: not active');
      continue;
    }
    if (data.code !== inviteCode) {
      continue;
    }
    if (data.expiresAt < now) {
      console.log('[one-shot-pair] Code "', name, '" failed: expired at', new Date(data.expiresAt).toISOString());
      return { valid: false, reason: 'expired' };
    }
    if (data.usedCount >= data.maxUses) {
      console.log('[one-shot-pair] Code "', name, '" failed: max uses reached', data.usedCount, '/', data.maxUses);
      return { valid: false, reason: 'max_uses_reached' };
    }

    console.log('[one-shot-pair] Code "', name, '" validation successful');
    console.log('[one-shot-pair]   - Expires:', new Date(data.expiresAt).toISOString());
    console.log('[one-shot-pair]   - Max uses:', data.maxUses);
    console.log('[one-shot-pair]   - Current uses:', data.usedCount);

    return {
      valid: true,
      codeName: name,
      data: data,
    };
  }

  console.log('[one-shot-pair] No matching valid invite code found');
  return { valid: false, reason: 'invalid or expired invite code' };
}

/**
 * 增加邀请码使用次数
 */
function incrementInviteCodeUsage(codeName) {
  console.log('[one-shot-pair] Incrementing invite code usage for:', codeName);
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
    console.log('[one-shot-pair] Invite code usage updated:', codeName, oldCount, '->', oldCount + 1);
    console.log('[one-shot-pair] Invite codes file saved to:', filePath);
  }
}

/**
 * Base64URL 编码
 */
function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

/**
 * Base64URL 解码
 */
function base64UrlDecode(input) {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * 字节转十六进制
 */
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA256 哈希（用于从公钥派生 deviceId）
 */
async function fingerprintPublicKey(publicKeyBytes) {
  const hash = await crypto.subtle.digest('SHA-256', publicKeyBytes.slice().buffer);
  return bytesToHex(new Uint8Array(hash));
}

/**
 * 生成有效的 ed25519 密钥对
 * 使用 Node.js crypto 模块生成真正的 ed25519 密钥对
 */
function generateEd25519KeyPair() {
  const nodeCrypto = require('crypto');

  // 生成真正的 ed25519 密钥对
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('ed25519');

  // 导出公钥为 SPKI DER 格式，然后提取原始的 32 字节公钥
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  // ed25519 SPKI 公钥：前 12 字节是前缀，后 32 字节是原始公钥
  const publicKeyBytes = new Uint8Array(publicKeyDer.slice(12));

  // 导出私钥为 PKCS8 DER 格式，然后提取原始的 32 字节私钥
  const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  // ed25519 PKCS8 私钥：最后 32 字节是原始私钥
  const privateKeyBytes = new Uint8Array(privateKeyDer.slice(-32));

  // 使用与 Control UI 相同的方式从公钥派生 deviceId（SHA256 哈希）
  const deviceId = nodeCrypto.createHash('sha256').update(publicKeyBytes).digest('hex');

  return {
    deviceId: deviceId,
    privateKey: base64UrlEncode(privateKeyBytes),
    publicKey: base64UrlEncode(publicKeyBytes),
  };
}

/**
 * 生成虚拟设备信息
 * @param {Object} options - 选项
 * @param {string} options.clientType - 客户端类型：'control-ui' 或 'node'
 */
async function generateVirtualDeviceInfo(options = {}) {
  const now = Date.now();
  const keyPair = await generateEd25519KeyPair();
  const clientType = options.clientType || 'control-ui';

  if (clientType === 'node') {
    return {
      deviceId: keyPair.deviceId,
      publicKey: keyPair.publicKey,
      displayName: 'Auto-Paired Node',
      platform: 'node',
      deviceFamily: 'nodejs',
      clientId: 'node-host',
      clientMode: 'node',
      role: 'node',
      scopes: [],
      keyPair: keyPair,
    };
  }

  // Control UI 默认配置
  return {
    deviceId: keyPair.deviceId,
    publicKey: keyPair.publicKey,
    displayName: 'Auto-Paired Device (Control UI)',
    platform: 'web',
    deviceFamily: 'browser',
    clientId: 'openclaw-control-ui',
    clientMode: 'webchat',
    role: 'operator',
    scopes: ['control'],
    keyPair: keyPair,
  };
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
 * 处理一键配对请求
 */
async function handleOneShotPair(req, res) {
  console.log('[one-shot-pair] === One-shot pair request received ===');
  console.log('[one-shot-pair] Method:', req.method);
  console.log('[one-shot-pair] URL:', req.url);

  // 只接受 GET 请求
  if (req.method !== 'GET') {
    console.log('[one-shot-pair] Rejected: Method not allowed:', req.method);
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  // 解析邀请码和客户端类型
  const url = new URL(req.url, 'http://localhost');
  const inviteCode = url.searchParams.get('inviteCode');
  const clientType = url.searchParams.get('clientType') || 'control-ui';

  console.log('[one-shot-pair] GET request, inviteCode:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(empty)', 'clientType:', clientType);

  if (!inviteCode) {
    console.log('[one-shot-pair] Missing inviteCode parameter');
    sendJson(res, 400, { ok: false, error: 'inviteCode is required' });
    return;
  }

  // 验证邀请码
  const verification = verifyInviteCode(inviteCode);
  if (!verification.valid) {
    console.log('[one-shot-pair] Invite code validation failed:', verification.reason);
    sendJson(res, 401, {
      ok: false,
      error: verification.reason,
      codeName: verification.codeName
    });
    return;
  }

  console.log('[one-shot-pair] Invite code validation successful, code name:', verification.codeName);

  // 检查 approveDevicePairing 函数是否可用
  if (!approveDevicePairing) {
    console.log('[one-shot-pair] Error: approveDevicePairing function not available');
    sendJson(res, 500, { ok: false, error: 'approveDevicePairing function not available' });
    return;
  }

  // 生成虚拟设备信息
  const deviceInfo = await generateVirtualDeviceInfo({ clientType });
  console.log('[one-shot-pair] Generated virtual device:', deviceInfo.deviceId, 'clientType:', deviceInfo.clientId, 'mode:', deviceInfo.clientMode);

  // 创建配对请求（直接写入 state 文件）
  console.log('[one-shot-pair] Creating pairing request...');
  const pairingResult = createPairingRequest(deviceInfo);

  if (pairingResult.status !== 'pending') {
    console.log('[one-shot-pair] Failed to create pairing request');
    sendJson(res, 500, { ok: false, error: 'Failed to create pairing request' });
    return;
  }

  console.log('[one-shot-pair] Pairing request created:', pairingResult.request.requestId);

  // 立即批准配对
  console.log('[one-shot-pair] Approving pairing...');
  const baseDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw');
  const approveResult = await approveDevicePairing(pairingResult.request.requestId, baseDir);

  if (!approveResult) {
    console.log('[one-shot-pair] Failed to approve pairing');
    sendJson(res, 500, { ok: false, error: 'Failed to approve pairing' });
    return;
  }

  console.log('[one-shot-pair] Pairing approved successfully!');
  console.log('[one-shot-pair]   - deviceId:', approveResult.device.deviceId);

  // 从返回结果中提取设备 token
  const tokens = approveResult.device.tokens || {};
  const firstRole = Object.keys(tokens)[0];
  const deviceToken = firstRole ? tokens[firstRole].token : null;

  console.log('[one-shot-pair]   - deviceToken:', deviceToken ? deviceToken.substring(0, 16) + '...' : '(none)');
  console.log('[one-shot-pair]   - role:', firstRole || '(none)');

  // 增加邀请码使用次数
  incrementInviteCodeUsage(verification.codeName);

  console.log('[one-shot-pair] Sending success response');
  sendJson(res, 200, {
    ok: true,
    paired: true,
    deviceId: approveResult.device.deviceId,
    deviceToken: deviceToken,
    role: firstRole,
    displayName: approveResult.device.displayName,
    // 新增：返回密钥对供浏览器创建 identity
    publicKey: deviceInfo.keyPair.publicKey,
    privateKey: deviceInfo.keyPair.privateKey,
  });

  console.log('[one-shot-pair] === One-shot pair request completed ===');
}

/**
 * 注册一键配对 HTTP 路由
 * @param {any} api - Plugin SDK API
 */
export function registerOneShotPairServer(api) {
  console.log('[one-shot-pair] === Registering one-shot pair server ===');

  if (!api) {
    console.error('[one-shot-pair] api is required');
    return null;
  }

  if (!api.registerHttpRoute) {
    console.error('[one-shot-pair] api.registerHttpRoute not available');
    return null;
  }

  api.registerHttpRoute({
    path: '/plugins/node-auto-register/api/one-shot-pair',
    auth: 'plugin',
    handler: handleOneShotPair,
    match: 'exact',
  });

  console.log('[one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair');
  console.log('[one-shot-pair] Endpoint URL: http://<gateway-host>:<gateway-port>/plugins/node-auto-register/api/one-shot-pair');
  console.log('[one-shot-pair] Example: GET /plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx');
  console.log('[one-shot-pair] === One-shot pair server registration complete ===');

  return () => {
    console.log('[one-shot-pair] Server unregistered');
  };
}

// 导出工具函数
export { handleOneShotPair, verifyInviteCode, loadInviteCodes };
