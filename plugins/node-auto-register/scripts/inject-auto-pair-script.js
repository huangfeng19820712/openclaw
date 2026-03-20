#!/usr/bin/env node

/**
 * OpenClaw Control UI Auto-Pair Script Injector
 *
 * 将自动配对脚本注入到 Control UI 的 index.html 中
 *
 * 注入方式：外部脚本引用（避免 CSP 问题）
 * - 将 auto-pair.js 复制到 Control UI 目录
 * - 在 index.html 中引用 <script src="auto-pair.js"></script>
 *
 * 用法:
 *   node scripts/inject-auto-pair-script.js [inject|remove]
 *
 * 环境变量:
 *   OPENCLAW_CONTROL_UI_ROOT - Control UI 根目录
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 获取 Control UI index.html 路径
 */
function getControlUiIndexPath() {
  // 优先使用环境变量
  if (process.env.OPENCLAW_CONTROL_UI_ROOT) {
    return path.join(process.env.OPENCLAW_CONTROL_UI_ROOT, 'index.html');
  }

  // 尝试常见路径
  const possiblePaths = [
    // 开发环境
    path.join(__dirname, '..', '..', 'ui', 'dist', 'index.html'),
    path.join(__dirname, '..', '..', 'dist', 'ui', 'index.html'),
    // 容器内路径 (Docker 构建后的 UI 输出目录)
    '/app/dist/control-ui/index.html',
    '/app/dist/ui/index.html',
    // 用户主目录 (运行时配置目录)
    path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'ui', 'index.html'),
    '/home/node/.openclaw/ui/index.html',
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // 如果都找不到，尝试从 workspace 查找（开发环境）
  const workspacePaths = [
    path.join(__dirname, '..', '..', '..', '..', '.openclaw', 'ui', 'index.html'),
    '/home/node/.openclaw/workspace/ui/dist/index.html',
  ];

  for (const p of workspacePaths) {
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
  const scriptPath = path.join(__dirname, '..', 'src', 'inject-auto-pair.js');

  if (fs.existsSync(scriptPath)) {
    return fs.readFileSync(scriptPath, 'utf-8');
  }

  // 尝试容器内路径
  const containerPath = '/home/node/.openclaw/workspace/plugins/node-auto-register/src/inject-auto-pair.js';
  if (fs.existsSync(containerPath)) {
    return fs.readFileSync(containerPath, 'utf-8');
  }

  return null;
}

/**
 * 注入脚本到 index.html（外部引用方式 - 避免 CSP 问题）
 * 使用插件提供的静态资源 URL 来加载脚本
 */
function injectScript(indexPath, scriptContent) {
  if (!fs.existsSync(indexPath)) {
    console.error('Error: index.html not found at', indexPath);
    return false;
  }

  let html = fs.readFileSync(indexPath, 'utf-8');

  // 检查是否已经注入（检查外部引用）
  if (html.includes('auto-pair.js')) {
    console.log('Auto-pair script already injected (external reference)');
    return true;
  }

  // 在 </head> 之前注入外部脚本引用（使用插件提供的 URL）
  const scriptTag = '<script src="/plugins/node-auto-register/static/auto-pair.js"></script>\n';
  const injectionPoint = '</head>';
  const injectedHtml = html.replace(injectionPoint, scriptTag + injectionPoint);

  // 写回文件
  fs.writeFileSync(indexPath, injectedHtml, 'utf-8');

  console.log('Auto-pair script reference injected to', indexPath);
  console.log('(CSP-compliant: external script file via plugin route)');
  return true;
}

/**
 * 从 index.html 移除脚本引用
 */
function removeScript(indexPath) {
  if (!fs.existsSync(indexPath)) {
    console.error('Error: index.html not found at', indexPath);
    return false;
  }

  let html = fs.readFileSync(indexPath, 'utf-8');

  // 移除外部脚本引用
  const scriptTag = '<script src="/plugins/node-auto-register/static/auto-pair.js"></script>\n';
  const scriptIndex = html.indexOf(scriptTag);

  if (scriptIndex === -1) {
    console.log('Auto-pair script reference not found in', indexPath);
  } else {
    const cleanHtml = html.replace(scriptTag, '');
    fs.writeFileSync(indexPath, cleanHtml, 'utf-8');
    console.log('Auto-pair script reference removed from', indexPath);
  }

  return true;
}

/**
 * 主函数
 */
function main() {
  const command = process.argv[2] || 'inject';

  if (command === 'inject') {
    const indexPath = getControlUiIndexPath();

    if (!indexPath) {
      console.error('Error: Could not find Control UI index.html');
      console.error('Set OPENCLAW_CONTROL_UI_ROOT environment variable or run from the plugin directory');
      process.exit(1);
    }

    const scriptContent = getAutoPairScript();

    if (!scriptContent) {
      console.error('Error: Could not find auto-pair script');
      process.exit(1);
    }

    const success = injectScript(indexPath, scriptContent);

    if (!success) {
      process.exit(1);
    }

    console.log('Done! Control UI will now support auto-pair with inviteCode parameter');
  } else if (command === 'remove') {
    const indexPath = getControlUiIndexPath();

    if (!indexPath) {
      console.error('Error: Could not find Control UI index.html');
      process.exit(1);
    }

    const success = removeScript(indexPath);

    if (!success) {
      process.exit(1);
    }

    console.log('Done! Auto-pair script removed');
  } else {
    console.log('OpenClaw Control UI Auto-Pair Script Injector');
    console.log();
    console.log('Usage:');
    console.log('  node inject-auto-pair-script.js inject   - Inject auto-pair script');
    console.log('  node inject-auto-pair-script.js remove   - Remove auto-pair script');
    console.log();
    console.log('Environment:');
    console.log('  OPENCLAW_CONTROL_UI_ROOT - Control UI root directory');
    console.log();
  }
}

main();
