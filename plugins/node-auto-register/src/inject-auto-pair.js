/**
 * OpenClaw Control UI Auto-Pair Script (Enhanced Version)
 *
 * 完整工作流程:
 * 1. 检测 URL 中的 inviteCode 参数
 * 2. 调用 /api/invite-pair 获取 tempToken
 * 3. 使用 tempToken 建立 WebSocket 连接到 /connect
 * 4. 监听配对完成事件
 * 5. 调用 /api/auto-pair 获取设备 token
 * 6. 保存设备 token 到 localStorage
 * 7. 刷新页面
 *
 * 使用方式:
 * - 首次配对：http://gateway:18789/control-ui/?inviteCode=xxx&session=main
 * - 已配对后：http://gateway:18789/control-ui/#token=yyy&session=main
 */

(function() {
  'use strict';

  const LOG_PREFIX = '[openclaw-auto-pair]';
  const API_BASE = '/plugins/node-auto-register/api';
  const CONNECT_WS_PATH = '/connect';

  // 存储状态
  let tempToken = null;
  let inviteCode = null;
  let pairingCompleted = false;
  let wsConnected = false;
  let originalWebSocket = null;

  /**
   * 日志输出
   */
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  /**
   * 错误日志
   */
  function logError(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  /**
   * 获取 URL 参数
   */
  function getUrlParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  /**
   * 调用临时凭证 API
   * 注意：tempToken 用于建立 WebSocket 连接时的凭证
   */
  async function fetchTempToken(inviteCode) {
    const apiUrl = API_BASE + '/invite-pair?inviteCode=' + encodeURIComponent(inviteCode);

    try {
      log('Fetching tempToken from:', apiUrl);
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      const result = await response.json();

      if (result.ok) {
        log('tempToken received, expires in', result.expiresInSeconds, 'seconds');
        return { success: true, tempToken: result.tempToken, expiresInSeconds: result.expiresInSeconds };
      } else {
        logError('tempToken fetch failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (err) {
      logError('tempToken request failed:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * 调用自动配对 API
   */
  async function autoPair(inviteCode) {
    const apiUrl = API_BASE + '/auto-pair?inviteCode=' + encodeURIComponent(inviteCode);

    try {
      log('Completing auto-pair...');
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      const result = await response.json();

      if (result.ok) {
        if (result.paired) {
          log('Device paired successfully!');
          log('  - deviceId:', result.deviceId);
          log('  - role:', result.role);
          log('  - deviceToken:', result.deviceToken ? result.deviceToken.substring(0, 16) + '...' : '(none)');
          return {
            success: true,
            action: 'paired',
            deviceId: result.deviceId,
            deviceToken: result.deviceToken,
            role: result.role,
          };
        } else if (result.alreadyPaired) {
          log('Device already paired');
          return { success: true, action: 'already-paired' };
        }
      } else {
        logError('Auto-pair failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (err) {
      logError('Auto-pair request failed:', err);
      return { success: false, error: err.message };
    }

    return { success: false, error: 'Unknown error' };
  }

  /**
   * 保存设备 token 到 localStorage
   */
  function saveDeviceToken(deviceId, deviceToken, role) {
    const storageKey = 'openclaw.device.auth.v1';

    const stored = {
      version: 1,
      deviceId: deviceId || 'auto-paired-' + Date.now(),
      tokens: {
        [role || 'operator']: {
          token: deviceToken,
          scopes: ['control'],
          createdAtMs: Date.now(),
        },
      },
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(stored));
      log('Device token saved to localStorage');
      log('  - Storage key:', storageKey);
      log('  - deviceId:', deviceId);
      log('  - role:', role);
      return true;
    } catch (err) {
      logError('Failed to save device token:', err);
      return false;
    }
  }

  /**
   * 拦截 WebSocket 连接，在连接头上添加 tempToken
   */
  function hijackWebSocket() {
    if (!window.WebSocket) {
      logError('WebSocket not available');
      return;
    }

    originalWebSocket = window.WebSocket;

    window.WebSocket = function(url, protocols) {
      log('WebSocket constructor called with URL:', url);

      // 检查是否是连接到 Gateway 的 WebSocket
      if (typeof url === 'string' && url.includes(CONNECT_WS_PATH)) {
        if (tempToken) {
          // 在 URL 中添加 tempToken 参数
          // 注意：这里假设 Gateway 支持通过查询参数传递凭证
          // 如果 Gateway 不支持，需要在 Gateway 端进行处理
          const separator = url.includes('?') ? '&' : '?';
          const augmentedUrl = url + separator + 'tempToken=' + encodeURIComponent(tempToken);
          log('Augmenting WebSocket connection with tempToken');
          log('  Original URL:', url);
          log('  Augmented URL:', augmentedUrl);

          // 创建新的 WebSocket 连接
          const ws = new originalWebSocket(augmentedUrl, protocols);
          setupWebSocketHandlers(ws);
          return ws;
        } else {
          logError('tempToken not available, connecting without augmentation');
        }
      }

      // 正常连接
      return new originalWebSocket(url, protocols);
    };

    // 保持原始 WebSocket 的静态属性
    window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
    window.WebSocket.OPEN = originalWebSocket.OPEN;
    window.WebSocket.CLOSING = originalWebSocket.CLOSING;
    window.WebSocket.CLOSED = originalWebSocket.CLOSED;

    log('WebSocket hijack installed');
  }

  /**
   * 设置 WebSocket 处理器
   */
  function setupWebSocketHandlers(ws) {
    ws.addEventListener('open', function() {
      log('WebSocket connected');
      wsConnected = true;
    });

    ws.addEventListener('error', function(err) {
      logError('WebSocket error:', err);
    });

    ws.addEventListener('close', function(event) {
      log('WebSocket closed:', event.code, event.reason);
      wsConnected = false;
    });

    // 监听消息，检测配对事件
    ws.addEventListener('message', function(event) {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
        if (data && data.method === 'device.pair.requested') {
          log('Detected device.pair.requested event');
          handlePairingRequested();
        }
      } catch (e) {
        // 忽略 JSON 解析错误
      }
    });
  }

  /**
   * 处理配对请求事件
   */
  async function handlePairingRequested() {
    if (pairingCompleted) {
      log('Pairing already completed, skipping');
      return;
    }

    pairingCompleted = true;

    log('Starting auto-pair process...');

    // 调用自动配对 API
    const result = await autoPair(inviteCode);

    if (result.success && result.deviceToken) {
      // 保存设备 token
      saveDeviceToken(result.deviceId, result.deviceToken, result.role);

      // 清理 URL 参数
      cleanUrlParams();

      // 延迟刷新页面
      log('Reloading page in 1 second...');
      setTimeout(() => {
        log('Reloading...');
        window.location.reload();
      }, 1000);
    } else if (result.success && result.action === 'already-paired') {
      // 已经配对过，直接清理 URL 并刷新
      log('Already paired, cleaning up and refreshing');
      cleanUrlParams();
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      logError('Auto-pair failed:', result.error);
      // 即使失败也清理 inviteCode 参数
      cleanUrlParams();
    }
  }

  /**
   * 清理 URL 参数
   */
  function cleanUrlParams() {
    const url = new URL(window.location.href);
    let changed = false;

    if (url.searchParams.has('inviteCode')) {
      url.searchParams.delete('inviteCode');
      changed = true;
    }

    // 也要清理 tempToken（如果存在）
    if (url.searchParams.has('tempToken')) {
      url.searchParams.delete('tempToken');
      changed = true;
    }

    if (changed) {
      window.history.replaceState({}, '', url.toString());
      log('URL parameters cleaned');
    }
  }

  /**
   * 主函数
   */
  async function main() {
    // 检查是否已经执行过
    if (window.__OPENCLAW_AUTO_PAIR_EXECUTED__) {
      log('Already executed, skipping');
      return;
    }
    window.__OPENCLAW_AUTO_PAIR_EXECUTED__ = true;

    log('=== Auto-pair script started ===');

    // 获取 URL 参数
    inviteCode = getUrlParam('inviteCode');

    // 没有 inviteCode，直接返回
    if (!inviteCode) {
      log('No inviteCode parameter, skipping auto-pair');
      return;
    }

    log('Invite code detected:', inviteCode.substring(0, 8) + '...');

    // 安装 WebSocket 拦截器
    hijackWebSocket();

    // 获取临时凭证
    log('Fetching tempToken...');
    const tokenResult = await fetchTempToken(inviteCode);

    if (!tokenResult.success) {
      logError('Failed to get tempToken:', tokenResult.error);
      // 清理 URL 参数
      cleanUrlParams();
      return;
    }

    tempToken = tokenResult.tempToken;
    log('tempToken acquired, expires in', tokenResult.expiresInSeconds, 'seconds');

    log('=== Auto-pair script initialized, waiting for WebSocket connection ===');
  }

  // 在 DOM 加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
