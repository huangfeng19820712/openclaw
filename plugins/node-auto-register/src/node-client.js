#!/usr/bin/env node

/**
 * OpenClaw Node Client
 *
 * 用于连接到 OpenClaw Gateway 的轻量级节点客户端
 * 支持通过邀请码或设备 token 进行认证
 */

import WebSocket from 'ws';
import { randomUUID, sign, createPrivateKey } from 'crypto';

/**
 * Base64URL 解码
 */
function base64UrlDecode(input) {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/**
 * Base64URL 编码
 */
function base64UrlEncode(buf) {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

/**
 * ED25519 SPKI 前缀（用于从原始公钥构建 PEM）
 */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * PKCS8 前缀（用于从原始私钥构建 PEM）
 */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * 将原始公钥字节转换为 SPKI PEM 格式
 */
function publicKeyBytesToPem(publicKeyBytes) {
  const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]);
  const pem = spkiDer.toString('base64').match(/.{1,64}/g).join('\n');
  return '-----BEGIN PUBLIC KEY-----\n' + pem + '\n-----END PUBLIC KEY-----';
}

/**
 * 将原始私钥字节转换为 PKCS8 PEM 格式
 */
function privateKeyBytesToPem(privateKeyBytes) {
  const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, privateKeyBytes]);
  const pem = pkcs8Der.toString('base64').match(/.{1,64}/g).join('\n');
  return '-----BEGIN PRIVATE KEY-----\n' + pem + '\n-----END PRIVATE KEY-----';
}

/**
 * 规范化设备元数据（与 gateway 保持一致）
 */
function normalizeDeviceMetadataForAuth(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' ? '' : trimmed;
}

/**
 * 构建 V3 版本的设备认证载荷（与 gateway 的 buildDeviceAuthPayloadV3 一致）
 */
function buildDeviceAuthPayloadV3(params) {
  const scopes = params.scopes.join(',');
  const token = params.token || '';
  const platform = normalizeDeviceMetadataForAuth(params.platform);
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily);
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join('|');
}

/**
 * 使用私钥对载荷进行签名（ed25519）
 */
function signDevicePayload(privateKeyPem, payload) {
  const key = createPrivateKey(privateKeyPem);
  const sig = sign(null, Buffer.from(payload, 'utf8'), key);
  return base64UrlEncode(sig);
}

/**
 * NodeClient - OpenClaw 节点客户端
 */
export class NodeClient {
  constructor(options = {}) {
    this.gatewayHost = options.gatewayHost || 'localhost';
    this.gatewayPort = options.gatewayPort || 18789;
    this.inviteCode = options.inviteCode || null;
    this.deviceToken = options.deviceToken || null;
    this.deviceId = options.deviceId || null;
    this.displayName = options.displayName || 'Node';
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectAttempts = 0;
    this.ws = null;
    this.connected = false;
    // 设备身份（用于签名验证）
    this.publicKey = options.publicKey || null;
    this.privateKey = options.privateKey || null;
    // 服务器提供的 nonce（用于签名）
    this.connectNonce = null;
  }

  /**
   * 初始化连接
   */
  async initialize() {
    // 如果没有 deviceToken，先通过邀请码获取
    if (!this.deviceToken && this.inviteCode) {
      console.log('[NodeClient] Requesting device token via one-shot pair API...');
      const token = await this.requestDeviceToken();
      if (!token) {
        console.error('[NodeClient] Failed to get device token');
        process.exit(1);
      }
      this.deviceToken = token;
    }

    // 连接到 Gateway
    this.connect();
  }

  /**
   * 通过 one-shot-pair API 获取设备 token
   */
  async requestDeviceToken() {
    const apiUrl = `http://${this.gatewayHost}:${this.gatewayPort}/plugins/node-auto-register/api/one-shot-pair?inviteCode=${encodeURIComponent(this.inviteCode)}`;

    try {
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (result.ok && result.deviceToken) {
        console.log('[NodeClient] Device token received');
        console.log('  DeviceId:', result.deviceId);
        console.log('  Role:', result.role);
        return result.deviceToken;
      } else {
        console.error('[NodeClient] API error:', result.error);
        return null;
      }
    } catch (err) {
      console.error('[NodeClient] Request failed:', err.message);
      return null;
    }
  }

  /**
   * 连接到 Gateway
   */
  connect() {
    const protocol = this.gatewayPort === 443 ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${this.gatewayHost}:${this.gatewayPort}/`;

    console.log('[NodeClient] Connecting to Gateway:', wsUrl);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('[NodeClient] WebSocket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      // 等待 connect.challenge 事件
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('error', (err) => {
      console.error('[NodeClient] WebSocket error:', err.message);
    });

    this.ws.on('close', (code, reason) => {
      console.log('[NodeClient] WebSocket closed:', code, reason?.toString());
      this.connected = false;
      this.reconnect();
    });
  }

  /**
   * 发送 connect 请求帧（握手）
   */
  sendConnectRequest() {
    if (!this.connectNonce) {
      console.error('[NodeClient] Cannot send connect request without nonce');
      return;
    }

    const now = Date.now();
    const nonce = this.connectNonce;

    // 构建设备签名载荷（使用 V3 格式）
    // 使用 node-host 和 node 模式，与 one-shot-pair API (clientType=node) 创建的设备信息一致
    const payloadStr = buildDeviceAuthPayloadV3({
      deviceId: this.deviceId,
      clientId: 'node-host',
      clientMode: 'node',
      role: 'node',
      scopes: [],
      signedAtMs: now,
      token: this.deviceToken,
      nonce: nonce,
      platform: 'node',  // 与配对时的 platform 保持一致
      deviceFamily: 'nodejs',
    });

    // 将原始私钥字节转换为 PEM 格式
    const privateKeyBytes = base64UrlDecode(this.privateKey);
    const privateKeyPem = privateKeyBytesToPem(privateKeyBytes);

    // 使用私钥签名
    const signature = signDevicePayload(privateKeyPem, payloadStr);

    const connectMessage = {
      type: 'req',
      id: 'connect-' + Date.now(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'node-host',
          displayName: this.displayName,
          version: '1.0.0',
          platform: 'node',  // 与配对时的 platform 保持一致
          mode: 'node',
          deviceFamily: 'nodejs',
        },
        device: {
          id: this.deviceId,
          publicKey: this.publicKey,
          signature: signature,
          signedAt: now,
          nonce: nonce,
        },
        auth: {
          deviceToken: this.deviceToken,
        },
        role: 'node',
        scopes: [],
      },
    };

    console.log('[NodeClient] Sending connect request with device identity...');
    console.log('[NodeClient] Payload:', payloadStr);
    this.ws.send(JSON.stringify(connectMessage));
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(message) {
    try {
      const msg = JSON.parse(message);
      console.log('[NodeClient] Received:', msg.type);

      // 处理 connect.challenge 事件
      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        this.connectNonce = msg.payload?.nonce;
        console.log('[NodeClient] Received connect challenge, nonce:', this.connectNonce?.substring(0, 8) + '...');
        this.sendConnectRequest();
        return;
      }

      switch (msg.type) {
        case 'res':
          // 处理响应
          if (msg.error) {
            console.error('[NodeClient] Error response:', msg.error);
          } else {
            console.log('[NodeClient] Success response:', msg.result || msg.payload);
          }
          break;

        case 'connect.request':
          // 处理连接请求（如果需要）
          console.log('[NodeClient] Connect request received');
          break;

        case 'call':
          // 处理工具调用
          this.handleCall(msg);
          break;

        case 'ping':
          // 响应 ping
          this.ws.send(JSON.stringify({ type: 'ping', payload: msg.payload }));
          break;

        default:
          console.log('[NodeClient] Unknown message type:', msg.type, msg);
      }
    } catch (err) {
      console.error('[NodeClient] Failed to parse message:', err.message);
    }
  }

  /**
   * 处理工具调用
   */
  handleCall(msg) {
    const { callId, name, params } = msg.payload || {};
    console.log('[NodeClient] Tool call:', name);

    // 根据工具名处理不同的请求
    switch (name) {
      case 'system.run':
        // 执行系统命令（示例）
        this.sendToolResponse(callId, { success: true, output: 'Command executed' });
        break;

      case 'device.info':
        // 返回设备信息
        this.sendToolResponse(callId, {
          deviceId: this.deviceId,
          displayName: this.displayName,
          status: 'online',
        });
        break;

      default:
        console.log('[NodeClient] Unknown tool:', name);
        this.sendToolResponse(callId, { error: 'Unknown tool: ' + name });
    }
  }

  /**
   * 发送工具响应
   */
  sendToolResponse(callId, result) {
    const response = {
      type: 'call.result',
      payload: {
        callId,
        result,
      },
    };
    this.ws.send(JSON.stringify(response));
  }

  /**
   * 重连逻辑
   */
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[NodeClient] Max reconnect attempts reached, giving up');
      process.exit(1);
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[NodeClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * 断开连接
   */
  disconnect() {
    console.log('[NodeClient] Disconnecting...');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

export default NodeClient;
