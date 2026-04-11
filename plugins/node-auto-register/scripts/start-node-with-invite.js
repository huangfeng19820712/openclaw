#!/usr/bin/env node

/**
 * OpenClaw Node 一键配对并启动脚本
 *
 * 功能:
 *   通过邀请码自动获取设备 token，然后启动节点连接到 Gateway
 *
 * 用法:
 *   node start-node-with-invite.js --invite-code <邀请码> --gateway <网关 host> --port <端口> --name <节点名>
 *
 * 示例:
 *   node start-node-with-invite.js --invite-code ABC123XYZ --gateway 192.168.90.6 --port 18789 --name "My Node"
 *
 * 或者使用 openclaw node run 命令（需要先手动获取 token）:
 *   openclaw node run --host <gateway-host> --port 18789 --display-name "Build Node" --auth.token <device-token>
 */

import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('start-node-with-invite')
  .description('通过邀请码一键配对并启动 OpenClaw 节点')
  .version(pkg.version)
  .requiredOption('--invite-code <code>', '邀请码')
  .requiredOption('--gateway <host>', 'Gateway 主机地址')
  .option('--port <port>', 'Gateway 端口', '18789')
  .option('--name <name>', '节点显示名称', 'Auto-Paired Node')
  .option('--dry-run', '只显示命令，不执行')
  .action(async (options) => {
    console.log('='.repeat(60));
    console.log('OpenClaw Node 一键配对启动');
    console.log('='.repeat(60));
    console.log(`Gateway: ${options.gateway}:${options.port}`);
    console.log(`邀请码：${options.inviteCode}`);
    console.log(`节点名称：${options.name}`);
    console.log('='.repeat(60));
    console.log();

    // 步骤 1: 调用 one-shot-pair API 获取设备 token
    console.log('[步骤 1/2] 正在通过邀请码获取设备 token...');

    const inviteCode = options.inviteCode;
    const gatewayHost = options.gateway;
    const gatewayPort = options.port;
    const apiUrl = `http://${gatewayHost}:${gatewayPort}/plugins/node-auto-register/api/one-shot-pair?inviteCode=${encodeURIComponent(inviteCode)}`;

    console.log(`API URL: ${apiUrl}`);

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!data.ok) {
        console.error('配对失败:', data);
        process.exit(1);
      }

      console.log();
      console.log('[配对成功]');
      console.log(`  设备 ID: ${data.deviceId}`);
      console.log(`  设备 Token: ${data.deviceToken}`);
      console.log(`  角色：${data.role}`);
      console.log(`  显示名称：${data.displayName}`);
      console.log();

      // 步骤 2: 生成启动命令
      console.log('[步骤 2/2] 生成节点启动命令...');
      console.log();

      // 使用 openclaw node run 命令启动
      const openclawCmd = [
        'openclaw',
        'node',
        'run',
        '--host', gatewayHost,
        '--port', gatewayPort,
        '--display-name', options.name,
        '--auth.token', data.deviceToken,
      ].join(' ');

      console.log('启动命令:');
      console.log('-'.repeat(60));
      console.log(`  ${openclawCmd}`);
      console.log('-'.repeat(60));
      console.log();

      if (options.dryRun) {
        console.log('[Dry Run] 不执行命令，退出');
        process.exit(0);
      }

      // 询问是否执行
      console.log('即将启动节点... (Ctrl+C 取消)');
      await sleep(2000);

      // 执行命令
      console.log('正在执行:', openclawCmd);
      console.log();

      const [cmd, ...args] = openclawCmd.split(' ');
      const child = spawn(cmd, args, {
        stdio: 'inherit',
        shell: false,
      });

      child.on('error', (err) => {
        console.error('启动失败:', err.message);
        process.exit(1);
      });

      child.on('close', (code) => {
        console.log(`\n节点进程退出，代码：${code}`);
        process.exit(code);
      });

    } catch (err) {
      console.error('错误:', err.message);
      console.error();
      console.error('可能的原因:');
      console.error('  1. 邀请码无效或已过期');
      console.error('  2. Gateway 不可达');
      console.error('  3. 插件未加载 (node-auto-register)');
      console.error();
      console.error('确保已执行以下操作:');
      console.error('  1. 在 Gateway 上运行 deploy-instance-with-invite.sh 部署实例');
      console.error('  2. 确认插件已加载：docker logs <容器名> | grep node-auto-register');
      process.exit(1);
    }
  });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

program.parse();
