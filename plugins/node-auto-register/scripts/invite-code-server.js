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
  const codes = loadInviteCodes();
  const now = Date.now();

  for (const [name, data] of Object.entries(codes)) {
    if (!data.active) continue;
    if (data.code !== inviteCode) continue;
    if (data.expiresAt < now) {
      return { valid: false, reason: 'expired' };
    }
    if (data.usedCount >= data.maxUses) {
      return { valid: false, reason: 'max_uses_reached' };
    }

    // 验证通过，增加使用次数
    data.usedCount++;
    saveInviteCodes(codes);

    return {
      valid: true,
      codeName: name,
      expiresAt: data.expiresAt,
    };
  }

  return { valid: false, reason: 'invalid_code' };
}

/**
 * 调用 Gateway API 批准配对
 */
async function approveNodePairing(gatewayUrl, nodeId, nodeInfo) {
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
    // 获取 pending 请求列表
    const listResponse = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listPayload),
    });

    const listResult = await listResponse.json();
    const pending = listResult.result?.pending || [];

    // 查找匹配的节点
    const pendingRequest = pending.find(p => p.nodeId === nodeId);

    if (!pendingRequest) {
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

      await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
    }

    // 再次获取 pending 列表
    const listResponse2 = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listPayload),
    });

    const listResult2 = await listResponse2.json();
    const pending2 = listResult2.result?.pending || [];
    const requestToUpdate = pending2.find(p => p.nodeId === nodeId);

    if (!requestToUpdate) {
      return { ok: false, error: 'Could not create pairing request' };
    }

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
    return approveResult;

  } catch (err) {
    console.error('[ERROR] Approve pairing failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * HTTP 请求处理
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // GET /health - 健康检查
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }

  // GET /codes - 列出所有邀请码
  if (req.method === 'GET' && url.pathname === '/codes') {
    const codes = loadInviteCodes();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(codes));
    return;
  }

  // POST /verify - 验证邀请码并批准配对
  if (req.method === 'POST' && url.pathname === '/verify') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { inviteCode, nodeId, nodeInfo, gatewayUrl } = data;

        if (!inviteCode || !nodeId || !gatewayUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields' }));
          return;
        }

        // 验证邀请码
        const verification = verifyInviteCode(inviteCode);
        if (!verification.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid invite code', reason: verification.reason }));
          return;
        }

        // 批准配对
        const approveResult = await approveNodePairing(gatewayUrl, nodeId, nodeInfo || {});

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          codeName: verification.codeName,
          expiresAt: verification.expiresAt,
          pairing: approveResult,
        }));

      } catch (err) {
        console.error('[ERROR] Verify failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('OpenClaw Invite Code Verification Server');
  console.log('='.repeat(60));
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
