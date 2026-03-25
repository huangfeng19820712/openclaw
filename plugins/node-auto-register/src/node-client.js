#!/usr/bin/env node

/**
 * OpenClaw Node Client
 *
 * 用于连接到 OpenClaw Gateway 的轻量级节点客户端
 * 支持通过邀请码或设备 token 进行认证
 */

import WebSocket from 'ws';

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

      // 发送 connect 请求
      this.sendConnectRequest();
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
    const connectMessage = {
      type: 'req',
      id: 'connect-' + Date.now(),
      method: 'connect',
      params: {
        minProtocol: 1,
        maxProtocol: 1,
        client: {
          id: this.deviceId || 'node-' + Date.now(),
          displayName: this.displayName,
          version: '1.0.0',
          platform: process.platform,
          mode: 'node',
        },
        auth: {
          deviceToken: this.deviceToken,
        },
      },
    };

    console.log('[NodeClient] Sending connect request...');
    this.ws.send(JSON.stringify(connectMessage));
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(message) {
    try {
      const msg = JSON.parse(message);
      console.log('[NodeClient] Received:', msg.type);

      switch (msg.type) {
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
          console.log('[NodeClient] Unknown message type:', msg.type);
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
