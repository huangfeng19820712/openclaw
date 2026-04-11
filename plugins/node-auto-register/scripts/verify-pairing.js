#!/usr/bin/env node

/**
 * OpenClaw Node 配对验证脚本
 *
 * 用于验证设备配对状态和连接测试
 *
 * 用法:
 *   node verify-pairing.js --device-id <device-id>
 *   node verify-pairing.js --list
 *   node verify-pairing.js --check-invite <invite-code>
 */

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('verify-pairing')
  .description('验证 OpenClaw 设备配对状态')
  .version(pkg.version);

/**
 * 获取 OpenClaw 目录路径
 */
function getOpenClawDir() {
  // 优先使用环境变量
  if (process.env.OPENCLAW_DIR) {
    return process.env.OPENCLAW_DIR;
  }

  // 尝试常见路径
  const possiblePaths = [
    '/home/node/.openclaw',  // 容器内路径
    '/data/openclaw/openclaw_instances/product1',  // 宿主机挂载路径（扁平结构）
    '/data/openclaw/openclaw_instances/product1/.openclaw',  // 宿主机挂载路径（.openclaw 结构）
    path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw')
  ];

  for (const p of possiblePaths) {
    try {
      // 检查 invite-codes.json 或 devices 目录是否存在
      if (fs.existsSync(path.join(p, 'invite-codes.json')) ||
          fs.existsSync(path.join(p, 'devices'))) {
        return p;
      }
    } catch (e) {
      // 忽略错误
    }
  }

  // 默认返回第一个
  return path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw');
}

/**
 * 获取设备配对文件路径
 */
function getPairedDevicesPath() {
  return path.join(getOpenClawDir(), 'devices', 'paired.json');
}

/**
 * 获取待配对文件路径
 */
function getPendingDevicesPath() {
  return path.join(getOpenClawDir(), 'devices', 'pending.json');
}

/**
 * 获取邀请码文件路径
 */
function getInviteCodesPath() {
  return path.join(getOpenClawDir(), 'invite-codes.json');
}

/**
 * 读取 JSON 文件
 */
function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * 列出所有已配对的设备
 */
function listPairedDevices() {
  const data = readJsonFile(getPairedDevicesPath());
  if (!data) {
    console.log('没有找到已配对的设备');
    return;
  }

  const devices = Object.values(data);
  console.log('='.repeat(80));
  console.log('已配对的设备列表');
  console.log('='.repeat(80));
  console.log();

  if (devices.length === 0) {
    console.log('没有设备');
    return;
  }

  devices.forEach((device, index) => {
    const isNode = device.clientId === 'node-host' && device.clientMode === 'node';
    console.log(`[${index + 1}] ${isNode ? '📦' : '💻'} ${device.displayName}`);
    console.log(`    Device ID:  ${device.deviceId}`);
    console.log(`    Client:     ${device.clientId} (${device.clientMode})`);
    console.log(`    Role:       ${device.role}`);
    console.log(`    Platform:   ${device.platform || 'unknown'} / ${device.deviceFamily || 'unknown'}`);
    console.log(`    Scopes:     ${device.scopes ? device.scopes.join(', ') : 'none'}`);
    console.log(`    Created:    ${new Date(device.createdAtMs).toLocaleString()}`);
    if (device.tokens) {
      const firstRole = Object.keys(device.tokens)[0];
      if (firstRole) {
        const token = device.tokens[firstRole].token;
        console.log(`    Token:      ${token.substring(0, 20)}...`);
        if (device.tokens[firstRole].lastUsedAtMs) {
          console.log(`    Last Used:  ${new Date(device.tokens[firstRole].lastUsedAtMs).toLocaleString()}`);
        }
      }
    }
    console.log();
  });
}

/**
 * 列出待配对请求
 */
function listPendingRequests() {
  const data = readJsonFile(getPendingDevicesPath());
  if (!data) {
    console.log('没有待处理的配对请求');
    return;
  }

  const requests = Object.values(data);
  console.log('='.repeat(80));
  console.log('待处理的配对请求');
  console.log('='.repeat(80));
  console.log();

  if (requests.length === 0) {
    console.log('没有待处理的请求');
    return;
  }

  requests.forEach((req, index) => {
    console.log(`[${index + 1}] ${req.displayName}`);
    console.log(`    Request ID: ${req.requestId}`);
    console.log(`    Device ID:  ${req.deviceId}`);
    console.log(`    Role:       ${req.role}`);
    console.log(`    Created:    ${new Date(req.ts).toLocaleString()}`);
    console.log(`    Silent:     ${req.silent ? 'Yes' : 'No'}`);
    console.log();
  });
}

/**
 * 列出邀请码
 */
function listInviteCodes() {
  const data = readJsonFile(getInviteCodesPath());
  if (!data) {
    console.log('没有找到邀请码');
    return;
  }

  const codes = Object.entries(data);
  console.log('='.repeat(80));
  console.log('邀请码列表');
  console.log('='.repeat(80));
  console.log();

  if (codes.length === 0) {
    console.log('没有邀请码');
    return;
  }

  codes.forEach(([name, info], index) => {
    const isValid = info.active && info.expiresAt > Date.now() && info.usedCount < info.maxUses;
    const status = isValid ? '✅ 有效' : (info.active ? '⏰ 已过期' : '❌ 已禁用');
    console.log(`[${index + 1}] ${status} - ${name}`);
    console.log(`    Code:       ${info.code}`);
    console.log(`    Role:       ${info.role}`);
    console.log(`    Max Uses:   ${info.maxUses}`);
    console.log(`    Used:       ${info.usedCount}`);
    console.log(`    Expires:    ${new Date(info.expiresAt).toLocaleString()}`);
    console.log();
  });
}

/**
 * 检查特定设备
 */
function checkDevice(deviceId) {
  const data = readJsonFile(getPairedDevicesPath());
  if (!data) {
    console.log(`设备 ${deviceId} 未找到`);
    return;
  }

  const device = data[deviceId];
  if (!device) {
    console.log(`设备 ${deviceId} 未配对`);
    console.log();
    console.log('可能的原因:');
    console.log('  1. 设备 ID 不正确');
    console.log('  2. 配对请求被拒绝');
    console.log('  3. 配对已被撤销');
    return;
  }

  console.log('='.repeat(80));
  console.log('设备详情');
  console.log('='.repeat(80));
  console.log();
  console.log(`Display Name: ${device.displayName}`);
  console.log(`Device ID:    ${device.deviceId}`);
  console.log(`Public Key:   ${device.publicKey}`);
  console.log(`Client:       ${device.clientId} (${device.clientMode})`);
  console.log(`Role:         ${device.role}`);
  console.log(`Platform:     ${device.platform} / ${device.deviceFamily}`);
  console.log(`Scopes:       ${device.scopes.join(', ') || 'none'}`);
  console.log(`Approved:     ${device.approvedScopes.join(', ') || 'none'}`);
  console.log(`Created:      ${new Date(device.createdAtMs).toLocaleString()}`);
  console.log(`Approved:     ${new Date(device.approvedAtMs).toLocaleString()}`);

  if (device.tokens) {
    console.log();
    console.log('Tokens:');
    Object.entries(device.tokens).forEach(([role, tokenInfo]) => {
      console.log(`  [${role}]:`);
      console.log(`    Token:      ${tokenInfo.token}`);
      console.log(`    Created:    ${new Date(tokenInfo.createdAtMs).toLocaleString()}`);
      if (tokenInfo.lastUsedAtMs) {
        console.log(`    Last Used:  ${new Date(tokenInfo.lastUsedAtMs).toLocaleString()}`);
      }
    });
  }
}

/**
 * 检查邀请码
 */
function checkInviteCode(inviteCode) {
  const data = readJsonFile(getInviteCodesPath());
  if (!data) {
    console.log('邀请码不存在');
    return;
  }

  const now = Date.now();
  let found = false;

  for (const [name, info] of Object.entries(data)) {
    if (info.code === inviteCode) {
      found = true;
      const isValid = info.active && info.expiresAt > now && info.usedCount < info.maxUses;
      const status = isValid ? '✅ 有效' : (info.active ? '⏰ 已过期' : '❌ 已禁用');

      console.log('='.repeat(80));
      console.log('邀请码详情');
      console.log('='.repeat(80));
      console.log();
      console.log(`Name:         ${name}`);
      console.log(`Code:         ${info.code}`);
      console.log(`Status:       ${status}`);
      console.log(`Role:         ${info.role}`);
      console.log(`Scopes:       ${info.scopes?.join(', ') || 'default'}`);
      console.log(`Active:       ${info.active ? 'Yes' : 'No'}`);
      console.log(`Max Uses:     ${info.maxUses}`);
      console.log(`Used Count:   ${info.usedCount}`);
      console.log(`Remaining:    ${Math.max(0, info.maxUses - info.usedCount)}`);
      console.log(`Created:      ${new Date(info.createdAt).toLocaleString()}`);
      console.log(`Expires:      ${new Date(info.expiresAt).toLocaleString()}`);
      console.log();

      if (!isValid) {
        if (!info.active) {
          console.log('⚠️  邀请码已被禁用');
        } else if (info.expiresAt <= now) {
          console.log('⚠️  邀请码已过期');
        } else if (info.usedCount >= info.maxUses) {
          console.log('⚠️  邀请码使用次数已达上限');
        }
      }
      break;
    }
  }

  if (!found) {
    console.log(`邀请码 "${inviteCode}" 不存在`);
  }
}

// 定义命令
program
  .command('list')
  .description('列出所有已配对的设备')
  .option('-p, --pending', '显示待处理的请求')
  .option('-i, --invites', '显示邀请码')
  .action((options) => {
    listPairedDevices();
    if (options.pending) {
      console.log();
      listPendingRequests();
    }
    if (options.invites) {
      console.log();
      listInviteCodes();
    }
  });

program
  .command('check <device-id>')
  .description('检查特定设备的配对状态')
  .action((deviceId) => {
    checkDevice(deviceId);
  });

program
  .command('check-invite <invite-code>')
  .description('检查邀请码状态')
  .action((inviteCode) => {
    checkInviteCode(inviteCode);
  });

program
  .command('pending')
  .description('列出待处理的配对请求')
  .action(() => {
    listPendingRequests();
  });

program
  .command('invites')
  .description('列出所有邀请码')
  .action(() => {
    listInviteCodes();
  });

program.parse();
