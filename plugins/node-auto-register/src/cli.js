#!/usr/bin/env node

/**
 * OpenClaw Node Auto-Register CLI
 *
 * 用法:
 *   方式 1 - 使用邀请码自动配对并启动:
 *     node cli.js --invite-code <code> --gateway <host> --port <port>
 *
 *   方式 2 - 直接使用 openclaw node run 命令:
 *     openclaw node run --host <host> --port <port> --display-name <name> --auth.token <token>
 *
 * 示例:
 *   node cli.js --invite-code abc123xyz --gateway 192.168.1.100 --port 18789
 *   node cli.js --invite-code abc123xyz -g 192.168.1.100 -p 18789 -n "My Node"
 */

import { Command } from 'commander';
import { NodeClient } from './node-client.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('openclaw-node-register')
  .description('Auto-register as an OpenClaw node with invite code')
  .version(pkg.version)
  .requiredOption('-i, --invite-code <code>', 'Invitation code for auto-pairing')
  .option('-g, --gateway <host>', 'Gateway host', 'localhost')
  .option('-p, --port <port>', 'Gateway port', '18789')
  .option('-n, --name <name>', 'Node display name')
  .option('--max-reconnect <count>', 'Max reconnect attempts', '10')
  .option('--dry-run', 'Show pairing result only, do not connect')
  .action(async (options) => {
    console.log('='.repeat(60));
    console.log('OpenClaw Node Auto-Register');
    console.log('='.repeat(60));
    console.log(`Gateway: ${options.gateway}:${options.port}`);
    console.log(`Invite Code: ${options.inviteCode}`);
    console.log(`Display Name: ${options.name || 'auto'}`);
    console.log('='.repeat(60));
    console.log();

    // 步骤 1: 调用 one-shot-pair API 获取设备 token
    console.log('[Step 1/2] Requesting device token via one-shot pair API...');

    const apiUrl = `http://${options.gateway}:${options.port}/plugins/node-auto-register/api/one-shot-pair?inviteCode=${encodeURIComponent(options.inviteCode)}&clientType=node`;

    try {
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.ok) {
        console.error('Pairing failed:', result);
        process.exit(1);
      }

      console.log();
      console.log('[Pairing Success]');
      console.log(`  Device ID:    ${result.deviceId}`);
      console.log(`  Device Token: ${result.deviceToken}`);
      console.log(`  Role:         ${result.role}`);
      console.log(`  DisplayName:  ${result.displayName}`);
      if (result.publicKey) {
        console.log(`  PublicKey:    ${result.publicKey.substring(0, 16)}...`);
      }
      console.log();

      if (options.dryRun) {
        console.log('[Dry Run] Pairing completed, skipping connection');
        console.log();
        console.log('To connect as a node, run:');
        console.log(`  openclaw node run --host ${options.gateway} --port ${options.port} \\`);
        console.log(`    --display-name "${options.name || 'Auto Node'}" \\`);
        console.log(`    --auth.token ${result.deviceToken}`);
        process.exit(0);
      }

      // 步骤 2: 使用获取的 token 连接到 Gateway
      console.log('[Step 2/2] Connecting to Gateway as node...');
      console.log();

      const client = new NodeClient({
        gatewayHost: options.gateway,
        gatewayPort: parseInt(options.port, 10),
        inviteCode: options.inviteCode,
        deviceToken: result.deviceToken,
        deviceId: result.deviceId,
        displayName: options.name,
        maxReconnectAttempts: parseInt(options.maxReconnect, 10),
        publicKey: result.publicKey,
        privateKey: result.privateKey,
      });

      // 处理退出信号
      process.on('SIGINT', () => {
        console.log('\n[INFO] Received SIGINT, disconnecting...');
        client.disconnect();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\n[INFO] Received SIGTERM, disconnecting...');
        client.disconnect();
        process.exit(0);
      });

      // 启动连接
      client.initialize();

    } catch (err) {
      console.error('Error:', err.message);
      console.error();
      console.error('Possible causes:');
      console.error('  1. Invalid or expired invite code');
      console.error('  2. Gateway unreachable');
      console.error('  3. Plugin not loaded (node-auto-register)');
      console.error();
      console.error('Make sure:');
      console.error('  1. The Gateway instance is running');
      console.error('  2. The plugin is loaded: docker logs <container> | grep node-auto-register');
      process.exit(1);
    }
  });

program.parse();
