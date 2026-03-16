/**
 * OpenClaw Control UI Auto-Pair Script
 *
 * 此脚本注入到 Control UI 页面，实现自动配对功能
 *
 * 工作流程:
 * 1. 页面加载时检测 URL 中的 inviteCode 和 token 参数
 * 2. 如果有 inviteCode，调用 /plugins/node-auto-register/api/auto-pair API 进行配对
 * 3. 配对成功后，如果有 token 则保存到 #hash 中，然后刷新页面
 * 4. 如果只有 token 没有 inviteCode，直接连接 Gateway
 *
 * 使用方式:
 * - 首次配对：http://gateway:18789/control-ui/?inviteCode=xxx&token=yyy&session=main
 * - 已配对后：http://gateway:18789/control-ui/?token=yyy&session=main
 * - 或者：http://gateway:18789/control-ui/#token=yyy&session=main
 */

(function() {
  'use strict';

  const LOG_PREFIX = '[openclaw-auto-pair]';

  /**
   * 调用自动配对 API
   */
  async function autoPair(inviteCode) {
    const apiUrl = '/plugins/node-auto-register/api/auto-pair?inviteCode=' + encodeURIComponent(inviteCode);

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      const result = await response.json();

      if (result.ok) {
        if (result.paired) {
          console.log(LOG_PREFIX, 'Device paired successfully:', result.deviceId);
          return { success: true, action: 'paired', deviceId: result.deviceId };
        } else if (result.alreadyPaired) {
          console.log(LOG_PREFIX, 'Device already paired');
          return { success: true, action: 'already-paired' };
        }
      } else {
        console.warn(LOG_PREFIX, 'Auto-pair failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (err) {
      console.warn(LOG_PREFIX, 'Auto-pair request failed:', err);
      return { success: false, error: err.message };
    }

    return { success: false, error: 'Unknown error' };
  }

  /**
   * 清理 URL 参数（保留 token 和 session）
   */
  function cleanUrlParams(keepToken) {
    const url = new URL(window.location.href);
    url.searchParams.delete('inviteCode');

    // 如果提供了 token，保存到 hash 中（避免被服务器清理）
    if (keepToken && url.searchParams.has('token')) {
      const token = url.searchParams.get('token');
      url.searchParams.delete('token');
      // 保存到 hash 中，格式：#token=xxx
      const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
      hashParams.set('token', token);
      url.hash = hashParams.toString();
    }

    window.history.replaceState({}, '', url.toString());
  }

  /**
   * 保存 token 到 localStorage（持久化存储）
   */
  function saveTokenToStorage(token) {
    try {
      const storageKey = 'openclaw_gateway_token';
      localStorage.setItem(storageKey, token);
      console.log(LOG_PREFIX, 'Token saved to localStorage');
    } catch (err) {
      console.warn(LOG_PREFIX, 'Failed to save token to localStorage:', err);
    }
  }

  /**
   * 从 localStorage 获取 token
   */
  function getTokenFromStorage() {
    try {
      const storageKey = 'openclaw_gateway_token';
      return localStorage.getItem(storageKey);
    } catch (err) {
      return null;
    }
  }

  /**
   * 主函数
   */
  async function main() {
    // 检查是否已经执行过
    if (window.__OPENCLAW_AUTO_PAIR_EXECUTED__) {
      console.log(LOG_PREFIX, 'Already executed, skipping');
      return;
    }
    window.__OPENCLAW_AUTO_PAIR_EXECUTED__ = true;

    // 获取 URL 参数
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '');

    const inviteCode = urlParams.get('inviteCode');
    // 优先从 hash 获取 token（更安全），其次从 search 获取
    let token = hashParams.get('token') || urlParams.get('token');

    // 如果没有 token，尝试从 localStorage 获取
    if (!token) {
      token = getTokenFromStorage();
      if (token) {
        console.log(LOG_PREFIX, 'Token loaded from localStorage');
      }
    }

    // 没有 inviteCode 且有 token，直接连接
    if (!inviteCode) {
      if (token) {
        console.log(LOG_PREFIX, 'No inviteCode, token available - will connect normally');
        // 将 token 设置到全局，供 app-settings.ts 使用
        window.__OPENCLAW_INITIAL_TOKEN__ = token;
      } else {
        console.log(LOG_PREFIX, 'No inviteCode and no token - pairing required');
      }
      return;
    }

    console.log(LOG_PREFIX, 'Invite code detected, starting auto-pair...');

    // 执行自动配对
    const result = await autoPair(inviteCode);

    if (result.success) {
      // 配对成功，保存 token（如果有）
      if (token) {
        saveTokenToStorage(token);
        // 将 token 设置到全局，供 app-settings.ts 使用
        window.__OPENCLAW_INITIAL_TOKEN__ = token;
      }

      // 清理 URL 参数
      cleanUrlParams(!!token);

      // 等待一小段时间让 UI 稳定，然后刷新页面
      setTimeout(() => {
        console.log(LOG_PREFIX, 'Refreshing page...');
        window.location.reload();
      }, 1000);
    } else {
      console.warn(LOG_PREFIX, 'Auto-pair failed:', result.error);
      // 配对失败也清理 inviteCode 参数，避免重复尝试
      cleanUrlParams(false);
    }
  }

  // 在 DOM 加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
