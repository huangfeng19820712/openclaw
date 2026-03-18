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
 * 3. 创建配对请求 (requestDevicePairing)
 * 4. 立即批准配对 (approveDevicePairing)
 * 5. 返回设备 token 给客户端
 *
 * 用法 (在 plugin 中注册):
 *   import { registerOneShotPairServer } from './one-shot-pair-server.js';
 *   registerOneShotPairServer(api);
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifyInviteCode, loadInviteCodes, incrementInviteCodeUsage } from './invite-pair-server.js';

// 引入 device-pairing 函数
let requestDevicePairing = null;
let approveDevicePairing = null;

function initDevicePairing() {
  try {
    // 尝试从 plugin-sdk 导入
    const devicePair = require('openclaw/plugin-sdk/device-pair');
    requestDevicePairing = devicePair.requestDevicePairing;
    approveDevicePairing = devicePair.approveDevicePairing;
  } catch (err) {
    // 尝试从源文件导入
    try {
      const infraPath = path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'dist', 'infra', 'device-pairing.js');
      const infra = require(infraPath);
      requestDevicePairing = infra.requestDevicePairing;
      approveDevicePairing = infra.approveDevicePairing;
    } catch (err2) {
      console.warn('[one-shot-pair] Could not import device-pairing functions:', err2.message);
    }
  }
}

// 初始化 device pairing 函数
initDevicePairing();

/**
 * 生成虚拟设备信息
 */
function generateVirtualDeviceInfo() {
  const now = Date.now();
  return {
    deviceId: `auto-pair-${now}-${randomUUID().substring(0, 8)}`,
    publicKey: `auto-generated-key-${randomUUID()}`,
    displayName: 'Auto-Paired Device (Control UI)',
    platform: 'web',
    deviceFamily: 'browser',
    clientId: 'openclaw-control-ui',
    clientMode: 'webchat',
    role: 'operator',
    scopes: ['control'],
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

  // 解析邀请码
  const url = new URL(req.url, 'http://localhost');
  const inviteCode = url.searchParams.get('inviteCode');

  console.log('[one-shot-pair] GET request, inviteCode:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(empty)');

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

  // 检查 device-pairing 函数是否可用
  if (!requestDevicePairing || !approveDevicePairing) {
    console.log('[one-shot-pair] Error: device-pairing functions not available');
    sendJson(res, 500, { ok: false, error: 'device-pairing functions not available' });
    return;
  }

  // 生成虚拟设备信息
  const deviceInfo = generateVirtualDeviceInfo();
  console.log('[one-shot-pair] Generated virtual device:', deviceInfo.deviceId);

  // 创建配对请求
  console.log('[one-shot-pair] Creating pairing request...');
  const pairingResult = await requestDevicePairing(deviceInfo);

  if (pairingResult.status !== 'pending') {
    console.log('[one-shot-pair] Failed to create pairing request');
    sendJson(res, 500, { ok: false, error: 'Failed to create pairing request' });
    return;
  }

  console.log('[one-shot-pair] Pairing request created:', pairingResult.request.requestId);

  // 立即批准配对
  console.log('[one-shot-pair] Approving pairing...');
  const approveResult = await approveDevicePairing(pairingResult.request.requestId);

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
export { handleOneShotPair };
