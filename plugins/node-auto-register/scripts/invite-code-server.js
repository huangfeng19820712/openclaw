#!/usr/bin/env node

/**
 * OpenClaw Invite Code Verification Server
 *
 * 独立的邀请码验证服务（无需修改 openclaw 源码）
 *
 * 工作原理:
 * 1. 节点插件调用此服务的 /verify 接口
 * 2. 服务验证邀请码后，自动调用 gateway 的 node.pair.approve API
 * 3. 返回配对结果给节点插件
 *
 * 用法:
 *   node invite-code-server.js --gateway http://localhost:18789
 */

import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.INVITE_SERVER_PORT || 18795;

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
 * 保存邀请码列表
 */
function saveInviteCodes(codes) {
  const filePath = getInviteCodeFilePath();
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(codes, null, 2), 'utf-8');
}

/**
 * 验证邀请码
 */
function verifyInviteCode(inviteCode) {
  console.log('[invite-server] Verifying invite code:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(empty)');
  const codes = loadInviteCodes();
  const now = Date.now();

  console.log('[invite-server] Loaded invite codes from:', getInviteCodeFilePath());
  console.log('[invite-server] Found', Object.keys(codes).length, 'invite code(s)');

  for (const [name, data] of Object.entries(codes)) {
    if (!data.active) {
      console.log('[invite-server] Code "', name, '" skipped: not active');
      continue;
    }
    if (data.code !== inviteCode) {
      continue;
    }
    if (data.expiresAt < now) {
      console.log('[invite-server] Code "', name, '" failed: expired at', new Date(data.expiresAt).toISOString());
      return { valid: false, reason: 'expired' };
    }
    if (data.usedCount >= data.maxUses) {
      console.log('[invite-server] Code "', name, '" failed: max uses reached', data.usedCount, '/', data.maxUses);
      return { valid: false, reason: 'max_uses_reached' };
    }

    console.log('[invite-server] Code "', name, '" validation successful');
    console.log('[invite-server]   - Expires:', new Date(data.expiresAt).toISOString());
    console.log('[invite-server]   - Max uses:', data.maxUses);
    console.log('[invite-server]   - Current uses:', data.usedCount);

    // 验证通过，增加使用次数
    data.usedCount++;
    saveInviteCodes(codes);
    console.log('[invite-server] Invite code usage incremented:', name, '->', data.usedCount);

    return {
      valid: true,
      codeName: name,
      expiresAt: data.expiresAt,
    };
  }

  console.log('[invite-server] No matching valid invite code found');
  return { valid: false, reason: 'invalid_code' };
}

/**
 * 调用 Gateway API 批准配对
 */
async function approveNodePairing(gatewayUrl, nodeId, nodeInfo) {
  console.log('[invite-server] Approving node pairing via gateway:', gatewayUrl);
  console.log('[invite-server]   - nodeId:', nodeId);
  console.log('[invite-server]   - displayName:', nodeInfo?.displayName || '(none)');

  const url = new URL('/rpc', gatewayUrl);

  const payload = {
    jsonrpc: '2.0',
    id: `approve-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method: 'node.pair.approve',
    params: {
      // 需要先获取 pending 列表，找到对应的 requestId
      // 这里简化处理，假设节点已经发起了 pair.request
    },
  };

  // 首先获取 pending 列表
  const listPayload = {
    jsonrpc: '2.0',
    id: `list-${Date.now()}`,
    method: 'node.pair.list',
    params: {},
  };

  try {
    console.log('[invite-server] Fetching pending pairing requests from gateway...');
    // 获取 pending 请求列表
    const listResponse = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listPayload),
    });

    const listResult = await listResponse.json();
    console.log('[invite-server] Gateway response:', JSON.stringify(listResult, null, 2).substring(0, 500));
    const pending = listResult.result?.pending || [];

    console.log('[invite-server] Found', pending.length, 'pending pairing request(s)');

    // 查找匹配的节点
    const pendingRequest = pending.find(p => p.nodeId === nodeId);

    if (!pendingRequest) {
      console.log('[invite-server] No pending request found for nodeId:', nodeId);
      // 如果没有 pending 请求，先创建一个新的
      const requestPayload = {
        jsonrpc: '2.0',
        id: `request-${Date.now()}`,
        method: 'node.pair.request',
        params: {
          nodeId,
          displayName: nodeInfo.displayName,
          platform: nodeInfo.platform,
          version: nodeInfo.version,
          caps: nodeInfo.caps || [],
          commands: nodeInfo.commands || [],
        },
      };

      console.log('[invite-server] Creating new pairing request...');
      await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
    }

    // 再次获取 pending 列表
    console.log('[invite-server] Refreshing pending pairing requests...');
    const listResponse2 = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listPayload),
    });

    const listResult2 = await listResponse2.json();
    const pending2 = listResult2.result?.pending || [];
    const requestToUpdate = pending2.find(p => p.nodeId === nodeId);

    if (!requestToUpdate) {
      console.log('[invite-server] Failed to get pairing request after creation');
      return { ok: false, error: 'Could not create pairing request' };
    }

    console.log('[invite-server] Found pending request, approving...');
    console.log('[invite-server]   - requestId:', requestToUpdate.requestId);

    // 批准配对
    const approvePayload = {
      jsonrpc: '2.0',
      id: `approve-${Date.now()}`,
      method: 'node.pair.approve',
      params: {
        requestId: requestToUpdate.requestId,
      },
    };

    const approveResponse = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(approvePayload),
    });

    const approveResult = await approveResponse.json();
    console.log('[invite-server] Pairing approval result:', JSON.stringify(approveResult, null, 2).substring(0, 500));
    return approveResult;

  } catch (err) {
    console.error('[invite-server] Approve pairing failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * HTTP 请求处理
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  console.log('[invite-server] === Request received ===');
  console.log('[invite-server] Method:', req.method);
  console.log('[invite-server] Path:', url.pathname);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('[invite-server] CORS preflight request, returning 200');
    res.writeHead(200);
    res.end();
    return;
  }

  // GET /health - 健康检查
  if (req.method === 'GET' && url.pathname === '/health') {
    console.log('[invite-server] Health check request');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }

  // GET /codes - 列出所有邀请码
  if (req.method === 'GET' && url.pathname === '/codes') {
    console.log('[invite-server] Listing invite codes');
    const codes = loadInviteCodes();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(codes));
    return;
  }

  // POST /verify - 验证邀请码并批准配对
  if (req.method === 'POST' && url.pathname === '/verify') {
    console.log('[invite-server] Verify request received');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        console.log('[invite-server] Request body:', body.substring(0, 200));
        const data = JSON.parse(body);
        const { inviteCode, nodeId, nodeInfo, gatewayUrl } = data;

        console.log('[invite-server] Parameters:');
        console.log('[invite-server]   - inviteCode:', inviteCode ? inviteCode.substring(0, 8) + '...' : '(missing)');
        console.log('[invite-server]   - nodeId:', nodeId || '(missing)');
        console.log('[invite-server]   - gatewayUrl:', gatewayUrl || '(missing)');

        if (!inviteCode || !nodeId || !gatewayUrl) {
          console.log('[invite-server] Missing required fields');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields' }));
          return;
        }

        // 验证邀请码
        const verification = verifyInviteCode(inviteCode);
        if (!verification.valid) {
          console.log('[invite-server] Invite code validation failed:', verification.reason);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid invite code', reason: verification.reason }));
          return;
        }

        console.log('[invite-server] Invite code validation successful, code name:', verification.codeName);

        // 批准配对
        console.log('[invite-server] Starting node pairing approval...');
        const approveResult = await approveNodePairing(gatewayUrl, nodeId, nodeInfo || {});

        console.log('[invite-server] Sending response...');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          codeName: verification.codeName,
          expiresAt: verification.expiresAt,
          pairing: approveResult,
        }));

      } catch (err) {
        console.error('[invite-server] Verify failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } finally {
        console.log('[invite-server] === Request completed ===');
      }
    });
    return;
  }

  // 404
  console.log('[invite-server] Unknown path, returning 404:', url.pathname);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('OpenClaw Invite Code Verification Server');
  console.log('='.repeat(60));
  console.log('Invite code file:', getInviteCodeFilePath());
  console.log(`Server running on http://localhost:${PORT}`);
  console.log();
  console.log('Endpoints:');
  console.log('  GET  /health  - Health check');
  console.log('  GET  /codes   - List invite codes');
  console.log('  POST /verify  - Verify and approve');
  console.log();
  console.log('Example usage:');
  console.log('  curl -X POST http://localhost:18795/verify \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"inviteCode":"xxx","nodeId":"node1","gatewayUrl":"http://localhost:18789"}\'');
  console.log('='.repeat(60));
});
