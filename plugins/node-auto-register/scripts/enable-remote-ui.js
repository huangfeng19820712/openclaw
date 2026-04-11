#!/usr/bin/env node

/**
 * Enable Remote Control UI Access
 *
 * 修改 Gateway 配置，允许远程访问 Control UI
 *
 * 用法:
 *   node enable-remote-ui.js                    # 允许所有来源（*）
 *   node enable-remote-ui.js --origin http://192.168.1.100:3000
 *   node enable-remote-ui.js --origin http://example.com
 */

import http from 'node:http';
import { URL } from 'node:url';

const GATEWAY_HOST = process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1';
const GATEWAY_PORT = process.env.OPENCLAW_GATEWAY_PORT || '18789';

/**
 * 调用 Gateway RPC
 */
function makeRpcCall(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: GATEWAY_HOST,
        port: GATEWAY_PORT,
        path: '/rpc',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * 获取当前配置
 */
async function getCurrentConfig() {
  const result = await makeRpcCall({
    jsonrpc: '2.0',
    id: 'get-config',
    method: 'config.get',
    params: { key: 'gateway.controlUi.allowedOrigins' },
  });
  return result.result;
}

/**
 * 设置配置
 */
async function setConfig(origins) {
  const result = await makeRpcCall({
    jsonrpc: '2.0',
    id: 'set-config',
    method: 'config.set',
    params: {
      key: 'gateway.controlUi.allowedOrigins',
      value: origins,
    },
  });
  return result;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  let origins = ['*']; // 默认允许所有

  // 解析 --origin 参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--origin' && args[i + 1]) {
      origins = [args[i + 1]];
      break;
    }
    if (args[i] === '--origins' && args[i + 1]) {
      origins = args[i + 1].split(',').map((o) => o.trim());
      break;
    }
  }

  console.log('='.repeat(60));
  console.log('OpenClaw Remote UI Access Configurator');
  console.log('='.repeat(60));
  console.log(`Gateway: ${GATEWAY_HOST}:${GATEWAY_PORT}`);
  console.log();

  try {
    // 获取当前配置
    console.log('Current allowedOrigins:');
    const current = await getCurrentConfig();
    console.log(JSON.stringify(current, null, 2));
    console.log();

    // 设置新配置
    console.log(`Setting allowedOrigins to: ${JSON.stringify(origins)}`);
    const setResult = await setConfig(origins);

    if (setResult.error) {
      console.error('Error:', setResult.error);
      process.exit(1);
    }

    console.log();
    console.log('Success! Remote UI access enabled.');
    console.log();
    console.log('You can now access Control UI from:');
    origins.forEach((o) => console.log(`  - ${o}`));
    console.log();
    console.log('Note: If using "*", any origin can access the Control UI.');
    console.log('      This is fine for internal networks, but consider');
    console.log('      restricting to specific origins in production.');
    console.log('='.repeat(60));
  } catch (err) {
    console.error('Error:', err.message);
    console.log();
    console.log('Make sure:');
    console.log(`  - Gateway is running at ${GATEWAY_HOST}:${GATEWAY_PORT}`);
    console.log('  - You have network access to the Gateway');
    console.log('='.repeat(60));
    process.exit(1);
  }
}

main();
