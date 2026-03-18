/**
 * OpenClaw Control UI Auto-Pair Script (Enhanced Version)
 *
 * 完整工作流程（一键配对模式）:
 * 1. 检测 URL 中的 inviteCode 参数
 * 2. 调用 /api/one-shot-pair 直接完成配对
 * 3. 保存设备 token 到 localStorage
 * 4. 刷新页面
 *
 * 使用方式:
 * - 首次配对：http://gateway:18789/control-ui/?inviteCode=xxx&session=main
 * - 已配对后：http://gateway:18789/control-ui/#token=yyy&session=main
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

    // 获取 URL 参数
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
