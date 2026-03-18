/**
 * OpenClaw Node Auto-Register - Control UI Auto-Pair Entry Point
 *
 * 在 plugin 初始化时自动注册 HTTP 路由并注入自动配对脚本
 */

import fs from 'node:fs';
import path from 'node:path';
import { registerOneShotPairServer } from './one-shot-pair-server.js';

/**
 * 查找 Control UI index.html 的可能路径
 */
function findControlUiIndexPath() {
  const possiblePaths = [
    // 容器内构建路径
    '/app/dist/control-ui/index.html',
    '/app/dist/ui/index.html',
    '/home/node/.openclaw/ui/index.html',
    '/home/node/.openclaw/workspace/ui/dist/index.html',
    // 开发路径
    path.join(process.cwd(), 'dist', 'control-ui', 'index.html'),
    path.join(process.cwd(), 'dist', 'ui', 'index.html'),
    // 用户配置目录
    path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'ui', 'index.html'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * 获取自动配对脚本内容
 */
function getAutoPairScript() {
  const scriptPath = path.join(path.dirname(import.meta.url.replace('file://', '')), 'inject-auto-pair.js');
  if (fs.existsSync(scriptPath)) {
    return fs.readFileSync(scriptPath, 'utf-8');
  }

  // 尝试其他路径
  const containerPath = '/home/node/.openclaw/workspace/plugins/node-auto-register/src/inject-auto-pair.js';
  if (fs.existsSync(containerPath)) {
    return fs.readFileSync(containerPath, 'utf-8');
  }

  return null;
}

/**
 * 注入脚本到 Control UI index.html
 */
function injectAutoPairScriptToControlUi() {
  console.log('[node-auto-register] Attempting to inject auto-pair script to Control UI...');

  const indexPath = findControlUiIndexPath();
  if (!indexPath) {
    console.warn('[node-auto-register] Could not find Control UI index.html - auto-pair script will not be injected');
    console.warn('[node-auto-register] Searched paths:');
    const possiblePaths = [
      '/app/dist/control-ui/index.html',
      '/app/dist/ui/index.html',
      '/home/node/.openclaw/ui/index.html',
      '/home/node/.openclaw/workspace/ui/dist/index.html',
    ];
    for (const p of possiblePaths) {
      console.warn('[node-auto-register]   -', p);
    }
    console.warn('[node-auto-register] To fix: run the following command:');
    console.warn('[node-auto-register]   node /home/node/.openclaw/workspace/plugins/node-auto-register/scripts/inject-auto-pair-script.js inject');
    return false;
  }

  console.log('[node-auto-register] Found Control UI index.html at:', indexPath);

  let html;
  try {
    html = fs.readFileSync(indexPath, 'utf-8');
  } catch (err) {
    console.error('[node-auto-register] Failed to read index.html:', err.message);
    return false;
  }

  // 检查是否已经注入
  if (html.includes('openclaw-auto-pair') || html.includes('OPENCLAW_AUTO_PAIR_EXECUTED')) {
    console.log('[node-auto-register] Auto-pair script already injected');
    return true;
  }

  const scriptContent = getAutoPairScript();
  if (!scriptContent) {
    console.error('[node-auto-register] Could not find auto-pair script content');
    return false;
  }

  // 在 </head> 之前注入
  const scriptTag = '<script>\n' + scriptContent + '\n</script>\n';
  const injectionPoint = '</head>';
  const injectedHtml = html.replace(injectionPoint, scriptTag + injectionPoint);

  try {
    fs.writeFileSync(indexPath, injectedHtml, 'utf-8');
    console.log('[node-auto-register] Auto-pair script injected successfully to:', indexPath);
    console.log('[node-auto-register] Control UI will now support automatic pairing with inviteCode parameter');
    return true;
  } catch (err) {
    console.error('[node-auto-register] Failed to write index.html:', err.message);
    return false;
  }
}

/**
 * OpenClaw Plugin 注册函数
 * 当 OpenClaw 加载此 plugin 时调用
 *
 * @param {any} api - Plugin SDK API
 * @returns {any} 清理函数
 */
export function register(api) {
  console.log('[node-auto-register] Plugin loaded');

  // 首先注入自动配对脚本到 Control UI
  injectAutoPairScriptToControlUi();

  try {
    // 注册一键配对服务
    const cleanupOneShotPair = registerOneShotPairServer(api);

    if (cleanupOneShotPair) {
      console.log('[node-auto-register] One-shot pair service registered successfully');

      // 返回清理函数
      return () => {
        if (cleanupOneShotPair) cleanupOneShotPair();
        console.log('[node-auto-register] Plugin unloading');
      };
    } else {
      console.warn('[node-auto-register] Failed to register one-shot pair service');
    }
  } catch (err) {
    console.error('[node-auto-register] Error registering service:', err);
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
