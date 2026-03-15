#!/usr/bin/env node

/**
 * Invite Code Proxy Hook
 *
 * 作为一个中间层，拦截 Gateway 的 WebSocket 连接，处理邀请码验证
 *
 * 工作原理:
 * 1. 监听 18795 端口（内部）
 * 2. 拦截 WebSocket 连接
 * 3. 检查是否有邀请码
 * 4. 如果有邀请码，自动调用 node.pair.approve
 * 5. 转发连接到 Gateway
 *
 * 用法:
 *   node invite-code-proxy.js --gateway-port 18789
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '18795', 10);
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '18789', 10);
const GATEWAY_HOST = process.env.GATEWAY_HOST || '127.0.0.1';

/**
 * 加载邀请码列表
 */
function loadInviteCodes() {
  const inviteCodePath = process.env.OPENCLAW_DIR
    ? path.join(process.env.OPENCLAW_DIR, 'invite-codes.json')
    : path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'invite-codes.json');

  try {
    const data = fs.readFileSync(inviteCodePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
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

    return { valid: true, codeName: name };
  }

  return { valid: false, reason: 'invalid_code' };
}

/**
 * 保存邀请码列表
 */
function saveInviteCodes(codes) {
  const inviteCodePath = process.env.OPENCLAW_DIR
    ? path.join(process.env.OPENCLAW_DIR, 'invite-codes.json')
    : path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'invite-codes.json');

  const dir = path.dirname(inviteCodePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(inviteCodePath, JSON.stringify(codes, null, 2), 'utf-8');
}

/**
 * 自动批准节点配对
 */
async function autoApprovePairing(nodeId, displayName) {
  const rpcPayload = {
    jsonrpc: '2.0',
    id: `auto-approve-${randomUUID()}`,
    method: 'node.pair.request',
    params: {
      nodeId,
      displayName,
      platform: 'linux',
      caps: ['node'],
      commands: ['system.run', 'system.notify', 'device.info', 'device.status'],
    },
  };

  try {
    // 先请求配对
    await makeRpcCall(rpcPayload);

    // 获取 pending 列表
    const listPayload = {
      jsonrpc: '2.0',
      id: `list-${randomUUID()}`,
      method: 'node.pair.list',
      params: {},
    };

    const listResult = await makeRpcCall(listPayload);
    const pending = listResult.result?.pending || [];
    const request = pending.find((p) => p.nodeId === nodeId);

    if (request) {
      // 批准配对
      const approvePayload = {
        jsonrpc: '2.0',
        id: `approve-${randomUUID()}`,
        method: 'node.pair.approve',
        params: { requestId: request.requestId },
      };

      await makeRpcCall(approvePayload);
      console.log(`[INFO] Auto-approved pairing for node: ${nodeId}`);
    }
  } catch (err) {
    console.error('[ERROR] Auto-approve failed:', err.message);
  }
}

/**
 * 调用 Gateway RPC
 */
function makeRpcCall(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: GATEWAY_HOST,
        port: GATEWAY_PORT,
        path: '/rpc',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * 启动 WebSocket 代理服务器
 */
function startProxy() {
  const wss = new WebSocketServer({
    port: PROXY_PORT,
    noServer: true,
  });

  const server = http.createServer((req, res) => {
    // 健康检查端点
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'invite-code-proxy' }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const inviteCode = url.searchParams.get('inviteCode');

    if (inviteCode) {
      // 验证邀请码
      const result = verifyInviteCode(inviteCode);

      if (!result.valid) {
        console.log(`[WARN] Invalid invite code from ${socket.remoteAddress}: ${result.reason}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      console.log(`[INFO] Valid invite code from ${socket.remoteAddress}: ${result.codeName}`);

      // 转发连接到 Gateway
      wss.handleUpgrade(request, socket, head, (ws) => {
        // 转发到 Gateway
        const gatewayWs = new WebSocket(`ws://${GATEWAY_HOST}:${GATEWAY_PORT}`);

        gatewayWs.on('open', () => {
          console.log('[INFO] Connected to Gateway');
        });

        gatewayWs.on('message', (data) => {
          ws.send(data);
        });

        ws.on('message', (data) => {
          if (gatewayWs.readyState === WebSocket.OPEN) {
            gatewayWs.send(data);
          }
        });

        gatewayWs.on('close', () => {
          ws.close();
        });

        ws.on('close', () => {
          gatewayWs.close();
        });

        // 处理配对
        const nodeId = url.searchParams.get('nodeId') || randomUUID();
        const displayName = url.searchParams.get('name') || 'node';

        autoApprovePairing(nodeId, displayName);
      });
    } else {
      // 没有邀请码，直接连接到 Gateway
      wss.handleUpgrade(request, socket, head, (ws) => {
        const gatewayWs = new WebSocket(`ws://${GATEWAY_HOST}:${GATEWAY_PORT}`);

        gatewayWs.on('open', () => {
          console.log('[INFO] Direct connection to Gateway');
        });

        gatewayWs.on('message', (data) => {
          ws.send(data);
        });

        ws.on('message', (data) => {
          if (gatewayWs.readyState === WebSocket.OPEN) {
            gatewayWs.send(data);
          }
        });

        gatewayWs.on('close', () => {
          ws.close();
        });

        ws.on('close', () => {
          gatewayWs.close();
        });
      });
    }
  });

  server.listen(PROXY_PORT, () => {
    console.log('='.repeat(60));
    console.log('Invite Code Proxy Started');
    console.log('='.repeat(60));
    console.log(`Proxy Port: ${PROXY_PORT}`);
    console.log(`Gateway: ws://${GATEWAY_HOST}:${GATEWAY_PORT}`);
    console.log();
    console.log('Usage:');
    console.log(`  node cli.js --invite-code <CODE> --gateway ${GATEWAY_HOST} --port ${PROXY_PORT}`);
    console.log('='.repeat(60));
  });
}

// 启动代理
startProxy();
