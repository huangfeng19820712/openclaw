/**
 * OpenClaw Node Auto-Register Plugin
 *
 * 使用邀请码自动注册成为 openclaw 节点
 *
 * 工作流程:
 * 1. 连接 Gateway WebSocket (或代理)
 * 2. 收到 connect.challenge
 * 3. 发送 connect.answer + 邀请码作为 token
 * 4. Gateway 验证邀请码并自动批准
 * 5. 建立连接，开始接收命令
 *
 * 用法:
 *   node src/cli.js --invite-code <邀请码> --gateway <gateway 地址>
 */

import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);

// 常量
const PROTOCOL_VERSION = '1.0';
const HEARTBEAT_INTERVAL_MS = 30000;
const RECONNECT_DELAY_MS = 5000;

/**
 * 生成设备 ID（基于机器信息）
 */
function generateDeviceId() {
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const userInfo = os.userInfo().username;
  const data = `${hostname}-${platform}-${arch}-${userInfo}-${Date.now()}`;
  return Buffer.from(data).toString('base64url').slice(0, 22);
}

/**
 * 获取平台信息
 */
function getPlatformInfo() {
  const platform = os.platform();
  const arch = os.arch();

  let deviceFamily = 'unknown';
  if (platform === 'darwin') {
    deviceFamily = 'mac';
  } else if (platform === 'win32') {
    deviceFamily = 'windows';
  } else if (platform === 'linux') {
    deviceFamily = 'linux';
  }

  return {
    platform,
    arch,
    deviceFamily,
    version: os.release(),
  };
}

/**
 * 节点类
 */
class NodeClient {
  constructor(options) {
    this.gatewayHost = options.gatewayHost || 'localhost';
    this.gatewayPort = options.gatewayPort || 18789;
    this.inviteCode = options.inviteCode;
    this.displayName = options.displayName || os.hostname();
    this.deviceId = options.deviceId || generateDeviceId();
    this.platform = getPlatformInfo();
    this.useProxy = options.useProxy || false;

    this.ws = null;
    this.connected = false;
    this.nodeId = this.deviceId;
    this.pairingApproved = false;
    this.heartbeatTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;

    // 声明支持的所有命令（full 权限）
    this.supportedCommands = [
      // 系统命令
      'system.run',
      'system.notify',
      'browser.proxy',

      // Canvas 命令（如果有 OpenClaw UI）
      'canvas.present',
      'canvas.hide',
      'canvas.navigate',
      'canvas.eval',
      'canvas.snapshot',
      'canvas.a2ui.push',
      'canvas.a2ui.pushJSONL',
      'canvas.a2ui.reset',

      // 相机命令
      'camera.list',
      'camera.snap',
      'camera.clip',

      // 屏幕命令
      'screen.record',

      // 位置命令
      'location.get',

      // 通知命令
      'notifications.list',
      'notifications.actions',

      // 设备命令
      'device.info',
      'device.status',
      'device.permissions',
      'device.health',

      // 联系人命令
      'contacts.search',
      'contacts.add',

      // 日历命令
      'calendar.events',
      'calendar.add',

      // 提醒事项
      'reminders.list',
      'reminders.add',

      // 照片
      'photos.latest',

      // 运动传感器
      'motion.activity',
      'motion.pedometer',

      // 短信
      'sms.send',
    ];
  }

  /**
   * 构建 WebSocket URL
   */
  buildWsUrl() {
    const protocol = this.gatewayHost.startsWith('https://') ? 'wss://' :
                     this.gatewayHost.startsWith('http://') ? 'ws://' : 'ws://';
    const host = this.gatewayHost.replace(/^https?:\/\//, '');

    // 如果使用代理，添加邀请码参数
    if (this.useProxy) {
      const params = new URLSearchParams({
        inviteCode: this.inviteCode,
        nodeId: this.nodeId,
        name: this.displayName,
      });
      return `${protocol}${host}:${this.gatewayPort}/?${params.toString()}`;
    }

    return `${protocol}${host}:${this.gatewayPort}`;
  }

  /**
   * 发送消息
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log('[SEND]', message.type || message.frame?.type);
    }
  }

  /**
   * 处理消息
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      console.log('[RECV]', message.type || message.event, message.id ? `id=${message.id}` : '');

      if (message.type === 'event') {
        this.handleEvent(message.event, message.payload);
      } else if (message.type === 'response') {
        this.handleResponse(message);
      }
    } catch (err) {
      console.error('[ERROR] Parse message failed:', err);
    }
  }

  /**
   * 处理事件
   */
  handleEvent(event, payload) {
    switch (event) {
      case 'connect.challenge':
        // 收到连接挑战，发送应答（带邀请码）
        this.handleChallenge(payload);
        break;

      case 'node.pair.resolved':
        // 配对请求已处理
        if (payload.decision === 'approved') {
          console.log('[INFO] Pairing approved with invite code!');
          this.pairingApproved = true;
        } else {
          console.error('[ERROR] Pairing rejected');
        }
        break;

      case 'node.invoke.request':
        // 收到调用请求
        this.handleInvokeRequest(payload);
        break;

      default:
        console.log('[EVENT]', event, payload);
    }
  }

  /**
   * 处理连接挑战
   */
  handleChallenge(payload) {
    console.log('[INFO] Received challenge, sending connect.answer with invite code');

    // 构建设备信息
    const deviceInfo = {
      id: this.nodeId,
      publicKey: '',
      signature: '',
    };

    const clientInfo = {
      id: 'openclaw-cli',
      mode: 'backend',
      displayName: this.displayName,
      platform: this.platform.platform,
      deviceFamily: this.platform.deviceFamily,
      version: '1.0.0',
    };

    // 使用邀请码作为 token
    const auth = this.inviteCode ? {
      token: this.inviteCode,
      inviteCode: this.inviteCode,
    } : {};

    // 发送连接应答
    this.send({
      type: 'frame',
      frame: {
        type: 'connect.answer',
        device: deviceInfo,
        client: clientInfo,
        auth: auth,
        caps: ['node'],
        commands: this.supportedCommands,
        permissions: {
          full: true,
        },
      },
    });
  }

  /**
   * 处理调用请求
   */
  handleInvokeRequest(payload) {
    const { id, command, params, paramsJSON } = payload;
    console.log(`[INVOKE] command=${command}`, params ? JSON.stringify(params) : paramsJSON);

    this.handleCommand(id, command, params || JSON.parse(paramsJSON || '{}'));
  }

  /**
   * 处理具体命令
   */
  async handleCommand(id, command, params) {
    let result = { ok: true, payload: null };

    try {
      switch (command) {
        case 'system.run': {
          const cmd = params.command || params.rawCommand;
          const timeoutMs = params.timeoutMs || 30000;
          const cwd = params.cwd;

          console.log(`[EXEC] Running: ${cmd}`);

          result.payload = await new Promise((resolve) => {
            exec(cmd, {
              shell: true,
              timeout: timeoutMs,
              cwd,
              maxBuffer: 10 * 1024 * 1024,
              env: { ...process.env, ...params.env },
            }, (error, stdout, stderr) => {
              if (error) {
                resolve({
                  success: false,
                  exitCode: error.code || 1,
                  stdout: stdout?.toString() || '',
                  stderr: stderr?.toString() || error.message,
                  timedOut: error.killed || false,
                });
              } else {
                resolve({
                  success: true,
                  exitCode: 0,
                  stdout: stdout?.toString() || '',
                  stderr: stderr?.toString() || '',
                });
              }
            });
          });

          console.log(`[EXEC] Completed: exit=${result.payload.exitCode}`);
          break;
        }

        case 'system.notify': {
          const message = params.message || params.text;
          console.log(`[NOTIFY] ${message}`);
          result.payload = { success: true, message };
          break;
        }

        case 'device.info': {
          result.payload = {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            release: os.release(),
            version: os.version(),
            cpus: os.cpus().length,
            totalmem: os.totalmem(),
            freemem: os.freemem(),
          };
          break;
        }

        case 'device.status': {
          result.payload = {
            uptime: os.uptime(),
            loadavg: os.loadavg(),
            freemem: os.freemem(),
            totalmem: os.totalmem(),
          };
          break;
        }

        default:
          result = {
            ok: false,
            error: {
              code: 'NOT_IMPLEMENTED',
              message: `Command ${command} not implemented`,
            },
          };
      }
    } catch (err) {
      console.error(`[ERROR] Command failed: ${command}`, err.message);
      result = {
        ok: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: err.message,
        },
      };
    }

    // 发送结果
    this.send({
      type: 'frame',
      frame: {
        type: 'node.invoke.result',
        id,
        nodeId: this.nodeId,
        command,
        ...result,
      },
    });
  }

  /**
   * 连接 gateway
   */
  connect() {
    const wsUrl = this.buildWsUrl();
    console.log(`[INFO] Connecting to ${wsUrl}...`);
    console.log(`[INFO] Using invite code: ${this.inviteCode?.slice(0, 8)}...${this.inviteCode?.slice(-8) || ''}`);
    console.log(`[INFO] Proxy mode: ${this.useProxy ? 'Yes' : 'No'}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('[INFO] WebSocket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (err) => {
      console.error('[ERROR] WebSocket error:', err.message);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[INFO] WebSocket closed: ${code} ${reason?.toString() || ''}`);
      this.connected = false;
      this.stopHeartbeat();

      // 自动重连
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`[INFO] Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      } else {
        console.error('[ERROR] Max reconnect attempts reached');
      }
    });
  }

  /**
   * 启动心跳
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'frame',
          frame: {
            type: 'ping',
            ts: Date.now(),
          },
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * 初始化 - 直接连接 Gateway
   */
  async initialize() {
    console.log('[INFO] Initializing node registration with invite code...');

    // 直接建立 WebSocket 连接
    this.connect();
  }
}

export { NodeClient };
