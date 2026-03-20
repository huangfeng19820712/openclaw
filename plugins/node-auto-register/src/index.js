/**
 * OpenClaw Node Auto-Register - Control UI Auto-Pair Entry Point
 *
 * 在 plugin 初始化时自动注册 HTTP 路由并注入自动配对脚本
 *
 * 注入方式：外部脚本引用（避免 CSP 问题）
 * - 注册 /plugins/node-auto-register/static/auto-pair.js 路由提供脚本
 * - 在 index.html 中引用外部脚本（使用完整 URL）
 */

import fs from 'node:fs';
import path from 'node:path';
import { registerOneShotPairServer } from './one-shot-pair-server.js';

/**
 * 获取 auto-pair 脚本内容
 */
function getAutoPairScript() {
  // 尝试从 src 目录读取
  const scriptPath = path.join(path.dirname(import.meta.url.replace('file://', '')), 'inject-auto-pair.js');
  if (fs.existsSync(scriptPath)) {
    return fs.readFileSync(scriptPath, 'utf-8');
  }

  // 尝试容器内路径
  const containerPath = '/home/node/.openclaw/workspace/plugins/node-auto-register/src/inject-auto-pair.js';
  if (fs.existsSync(containerPath)) {
    return fs.readFileSync(containerPath, 'utf-8');
  }

  // 尝试插件根目录路径
  const pluginPath = '/home/node/.openclaw/workspace/plugins/node-auto-register/src/inject-auto-pair.js';
  if (fs.existsSync(pluginPath)) {
    return fs.readFileSync(pluginPath, 'utf-8');
  }

  return null;
}

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
 * 注入脚本到 Control UI index.html（外部引用方式 - 避免 CSP 问题）
 * 使用插件提供的静态资源 URL 来加载脚本
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

  // 检查是否已经注入（检查外部引用）
  if (html.includes('auto-pair.js')) {
    console.log('[node-auto-register] Auto-pair script already injected (external reference)');
    return true;
  }

  // 在 </head> 之前注入外部脚本引用（使用插件提供的 URL）
  // 脚本将通过插件的 HTTP 路由提供，这样就不需要复制文件到 Control UI 目录
  const scriptTag = '<script src="/plugins/node-auto-register/static/auto-pair.js"></script>\n';
  const injectionPoint = '</head>';
  const injectedHtml = html.replace(injectionPoint, scriptTag + injectionPoint);

  try {
    fs.writeFileSync(indexPath, injectedHtml, 'utf-8');
    console.log('[node-auto-register] Auto-pair script reference injected successfully to:', indexPath);
    console.log('[node-auto-register] Control UI will now support automatic pairing with inviteCode parameter');
    console.log('[node-auto-register] Script loaded from: /plugins/node-auto-register/static/auto-pair.js (CSP-compliant)');
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
    } else {
      console.warn('[node-auto-register] Failed to register one-shot pair service');
    }

    // 注册静态脚本路由（提供 auto-pair.js）
    const cleanupStaticRoute = registerAutoPairScriptRoute(api);

    if (cleanupStaticRoute) {
      console.log('[node-auto-register] Auto-pair script static route registered successfully');
    } else {
      console.warn('[node-auto-register] Failed to register auto-pair script route');
    }

    // 返回清理函数
    return () => {
      if (cleanupOneShotPair) cleanupOneShotPair();
      if (cleanupStaticRoute) cleanupStaticRoute();
      console.log('[node-auto-register] Plugin unloading');
    };
  } catch (err) {
    console.error('[node-auto-register] Error registering service:', err);
  }

  return () => {
    console.log('[node-auto-register] Plugin unloading');
  };
}

/**
 * 注册自动配对脚本的静态资源路由
 * 提供 /plugins/node-auto-register/static/auto-pair.js 端点
 */
function registerAutoPairScriptRoute(api) {
  if (!api || !api.registerHttpRoute) {
    console.warn('[node-auto-register] api.registerHttpRoute not available for static route');
    return null;
  }

  const scriptContent = getAutoPairScript();
  if (!scriptContent) {
    console.error('[node-auto-register] Could not find auto-pair script content for static route');
    return null;
  }

  api.registerHttpRoute({
    path: '/plugins/node-auto-register/static/auto-pair.js',
    auth: 'plugin',
    handler: (req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.end(scriptContent);
    },
    match: 'exact',
  });

  console.log('[node-auto-register] Static route registered at /plugins/node-auto-register/static/auto-pair.js');

  return () => {
    console.log('[node-auto-register] Static route unregistered');
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
