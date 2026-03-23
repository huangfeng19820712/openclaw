/**
 * OpenClaw Control UI Auto-Pair Script (Enhanced Version)
 *
 * 完整工作流程（一键配对模式）:
 * 1. 检测 URL 中的 inviteCode 参数
 * 2. 调用 /api/one-shot-pair 直接完成配对
 * 3. 保存设备 token 到 localStorage
 * 4. 刷新页面
 *
 * 支持 URL token 参数（临时访问）:
 * - http://gateway:18889/control-ui/?token=xxx&session=main
 *
 * 使用方式:
 * - 首次配对：http://gateway:18789/control-ui/?inviteCode=xxx&session=main
 * - 已配对后：http://gateway:18789/control-ui/#token=yyy&session=main
 * - 临时访问：http://gateway:18789/control-ui/?token=zzz&session=main
 */

(function() {
  'use strict';

  const LOG_PREFIX = '[openclaw-auto-pair]';
  const API_BASE = '/plugins/node-auto-register/api';

  // 存储状态
  let inviteCode = null;
  let pairingCompleted = false;

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
   * 处理 URL 中的 gateway token 参数（临时访问）
   * 将 token 保存到 sessionStorage，与 Control UI 原生格式一致
   */
  function handleGatewayTokenParam() {
    const tokenParam = getUrlParam('token');
    if (!tokenParam) {
      return false;
    }

    log('Gateway token parameter detected');

    try {
      // 获取当前 gateway URL
      const configuredBasePath = typeof window !== 'undefined' && window.__OPENCLAW_CONTROL_UI_BASE_PATH__
        ? window.__OPENCLAW_CONTROL_UI_BASE_PATH__.trim()
        : '';
      const basePath = configuredBasePath || inferBasePathFromPathname(window.location.pathname);
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const gatewayUrl = `${protocol}//${location.host}${basePath}`;

      // 构建 token storage key（与 storage.ts 逻辑一致）
      const normalizeScope = (url) => {
        try {
          const parsed = new URL(url);
          const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
          return `${parsed.protocol}//${parsed.host}${pathname}`;
        } catch {
          return url;
        }
      };
      const tokenSessionKeyPrefix = 'openclaw.control.token.v1:';
      const tokenSessionKey = `${tokenSessionKeyPrefix}${normalizeScope(gatewayUrl)}`;

      // 保存到 sessionStorage
      sessionStorage.setItem(tokenSessionKey, tokenParam.trim());
      log('Gateway token saved to sessionStorage:', tokenSessionKey);

      // 清理 URL 中的 token 参数（安全考虑）
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
      log('Token parameter removed from URL');

      return true;
    } catch (err) {
      logError('Failed to handle gateway token:', err);
      return false;
    }
  }

  /**
   * 从 URL pathname 推断 basePath（辅助函数）
   */
  function inferBasePathFromPathname(pathname) {
    if (!pathname || pathname === '/' || pathname === '/ui/' || pathname === '/control-ui/') {
      return '/';
    }
    const match = pathname.match(/^\/(?:control-ui|ui)(\/|$)/);
    if (match) {
      return pathname.split(match[0])[0] + '/';
    }
    return '/';
  }

  /**
   * 调用一键配对 API
   * 直接完成配对并返回设备 token，无需 WebSocket 连接
   */
  async function oneShotPair(inviteCode) {
    const apiUrl = API_BASE + '/one-shot-pair?inviteCode=' + encodeURIComponent(inviteCode);

    try {
      log('Requesting one-shot pair...');
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
            displayName: result.displayName,
            publicKey: result.publicKey,
            privateKey: result.privateKey,
          };
        } else if (result.alreadyPaired) {
          log('Device already paired');
          return { success: true, action: 'already-paired' };
        }
      } else {
        logError('One-shot pair failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (err) {
      logError('One-shot pair request failed:', err);
      return { success: false, error: err.message };
    }

    return { success: false, error: 'Unknown error' };
  }

  /**
   * Base64URL 编码（保留用于兼容性）
   */
  function base64UrlEncode(str) {
    if (typeof str === 'string') {
      return str;  // 已经是字符串，直接返回
    }
    let binary = '';
    for (const byte of str) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
  }

  /**
   * 保存设备 token 到 localStorage
   * 同时创建 device-identity，确保 Control UI 能正确读取
   */
  function saveDeviceToken(deviceId, deviceToken, role, publicKey, privateKey) {
    const authStorageKey = 'openclaw.device.auth.v1';
    const identityStorageKey = 'openclaw-device-identity-v1';

    // 1. 保存设备 token（与 Control UI 格式一致）
    const authStored = {
      version: 1,
      deviceId: deviceId,
      tokens: {
        [role || 'operator']: {
          token: deviceToken,
          role: role || 'operator',
          scopes: ['control'],
          updatedAtMs: Date.now(),
        },
      },
    };

    // 2. 创建 device identity（使用 API 返回的有效密钥对）
    const identityStored = {
      version: 1,
      deviceId: deviceId,  // 使用 API 返回的实际 deviceId
      publicKey: publicKey,  // 使用 API 返回的有效公钥
      privateKey: privateKey,  // 使用 API 返回的有效私钥
      createdAtMs: Date.now(),
    };

    try {
      localStorage.setItem(authStorageKey, JSON.stringify(authStored));
      localStorage.setItem(identityStorageKey, JSON.stringify(identityStored));
      log('Device token and identity saved to localStorage');
      log('  - Auth key:', authStorageKey);
      log('  - Identity key:', identityStorageKey);
      log('  - deviceId:', deviceId);
      log('  - role:', role);
      return true;
    } catch (err) {
      logError('Failed to save device token:', err);
      return false;
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

    if (changed) {
      window.history.replaceState({}, '', url.toString());
      log('URL parameters cleaned');
    }
  }

  /**
   * 处理配对
   */
  async function handlePairing() {
    if (pairingCompleted) {
      log('Pairing already completed, skipping');
      return;
    }

    pairingCompleted = true;

    log('Starting one-shot pair process...');

    // 调用一键配对 API
    const result = await oneShotPair(inviteCode);

    if (result.success && result.deviceToken) {
      // 保存设备 token 和 identity
      saveDeviceToken(result.deviceId, result.deviceToken, result.role, result.publicKey, result.privateKey);

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
      logError('One-shot pair failed:', result.error);
      // 即使失败也清理 inviteCode 参数
      cleanUrlParams();
    }
  }

  /**
   * 主函数
   */
  function main() {
    // 检查是否已经执行过
    if (window.__OPENCLAW_AUTO_PAIR_EXECUTED__) {
      log('Already executed, skipping');
      return;
    }
    window.__OPENCLAW_AUTO_PAIR_EXECUTED__ = true;

    log('=== Auto-pair script started ===');

    // 1. 首先处理 gateway token 参数（临时访问）
    if (handleGatewayTokenParam()) {
      log('Gateway token handled, page will use it for authentication');
      // 刷新页面以应用 token
      setTimeout(() => {
        window.location.reload();
      }, 500);
      return;
    }

    // 2. 获取 inviteCode 参数
    inviteCode = getUrlParam('inviteCode');

    // 没有 inviteCode，直接返回
    if (!inviteCode) {
      log('No inviteCode parameter, skipping auto-pair');
      return;
    }

    log('Invite code detected:', inviteCode.substring(0, 8) + '...');

    // 直接开始配对（无需 WebSocket）
    handlePairing();

    log('=== Auto-pair script completed ===');
  }

  // 在 DOM 加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
