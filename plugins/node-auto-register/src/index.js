/**
 * OpenClaw Node Auto-Register - Control UI Auto-Pair Entry Point
 *
 * 在 plugin 初始化时自动注册 HTTP 路由
 */

import { registerAutoPairServer } from './auto-pair-server.js';

/**
 * OpenClaw Plugin 注册函数
 * 当 OpenClaw 加载此 plugin 时调用
 *
 * @param {any} api - Plugin SDK API
 * @returns {any} 清理函数
 */
export function register(api) {
  console.log('[node-auto-register] Plugin loaded');

  try {
    // 初始化自动配对服务，传入 api 以使用正确的 registry
    const cleanupAutoPair = registerAutoPairServer(api);

    if (cleanupAutoPair) {
      console.log('[node-auto-register] Auto-pair service registered');

      // 返回清理函数
      return cleanupAutoPair;
    } else {
      console.warn('[node-auto-register] Failed to register auto-pair service');
    }
  } catch (err) {
    console.error('[node-auto-register] Error registering auto-pair service:', err);
  }

  return () => {
    console.log('[node-auto-register] Plugin unloading');
  };
}

/**
 * OpenClaw Plugin 定义
 */
export default {
  id: 'node-auto-register',
  name: 'Node Auto-Register',
  description: 'Auto-register openclaw node with invite code. Also provides Control UI auto-pair functionality.',
  version: '1.0.0',
  register,
};
