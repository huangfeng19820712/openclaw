/**
 * OpenClaw Control UI Auto-Pair Script
 *
 * 此脚本注入到 Control UI 页面，实现自动配对功能
 *
 * 工作流程:
 * 1. 页面加载时检测 URL 中的 inviteCode 参数
 * 2. 调用 /plugins/node-auto-register/api/auto-pair API
 * 3. 配对成功后清理 URL 参数并刷新页面
 *
 * 使用方式:
 * 访问 URL: http://gateway:18789/control-ui/?inviteCode=xxx&session=main
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
   * 清理 URL 参数
   */
  function cleanUrlParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete('inviteCode');
    window.history.replaceState({}, '', url.toString());
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

    // 获取 inviteCode 参数
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('inviteCode');

    if (!inviteCode) {
      console.log(LOG_PREFIX, 'No inviteCode parameter, skipping');
      return;
    }

    console.log(LOG_PREFIX, 'Invite code detected, starting auto-pair...');

    // 执行自动配对
    const result = await autoPair(inviteCode);

    if (result.success) {
      // 配对成功，清理 URL 参数
      cleanUrlParams();

      // 等待一小段时间让 UI 稳定，然后刷新页面
      setTimeout(() => {
        console.log(LOG_PREFIX, 'Refreshing page...');
        window.location.reload();
      }, 1000);
    } else {
      console.warn(LOG_PREFIX, 'Auto-pair failed:', result.error);
      // 即使失败也清理 inviteCode 参数，避免重复尝试
      cleanUrlParams();
    }
  }

  // 在 DOM 加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
