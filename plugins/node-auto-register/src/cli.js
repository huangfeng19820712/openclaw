#!/usr/bin/env node

/**
 * OpenClaw Node Auto-Register CLI
 *
 * 用法:
 *   node cli.js --invite-code <邀请码> --gateway <gateway 地址> --port <端口>
 *
 * 示例:
 *   node cli.js --invite-code abc123xyz --gateway 192.168.1.100 --port 18789
 */

import { Command } from 'commander';
import { NodeClient } from './index.js';
import pkg from '../package.json' assert { type: 'json' };

const program = new Command();

program
  .name('openclaw-node-register')
  .description('Auto-register as an OpenClaw node with invite code')
  .version(pkg.version)
  .requiredOption('--invite-code <code>', 'Invitation code for auto-pairing')
  .option('--gateway <host>', 'Gateway host', 'localhost')
  .option('--port <port>', 'Gateway port', '18789')
  .option('--name <name>', 'Node display name')
  .option('--max-reconnect <count>', 'Max reconnect attempts', '10')
  .option('--use-proxy', 'Use invite code proxy (connects to proxy port instead of gateway)')
  .option('--proxy-port <port>', 'Proxy port', '18795')
  .action((options) => {
    console.log('='.repeat(60));
    console.log('OpenClaw Node Auto-Register');
    console.log('='.repeat(60));
    console.log(`Gateway: ${options.gateway}:${options.port}`);
    console.log(`Invite Code: ${options.inviteCode.slice(0, 8)}...${options.inviteCode.slice(-8)}`);
    console.log(`Display Name: ${options.name || 'auto'}`);

    if (options.useProxy) {
      console.log(`Proxy Mode: Enabled (port ${options.proxyPort})`);
      console.log(`Note: Connects to proxy for invite code verification`);
    }

    console.log('='.repeat(60));
    console.log();

    // 如果使用代理，连接到代理端口
    const targetPort = options.useProxy
      ? parseInt(options.proxyPort, 10)
      : parseInt(options.port, 10);

    const client = new NodeClient({
      gatewayHost: options.gateway,
      gatewayPort: targetPort,
      inviteCode: options.inviteCode,
      displayName: options.name,
      maxReconnectAttempts: parseInt(options.maxReconnect, 10),
      useProxy: options.useProxy,
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
  });

program.parse();
