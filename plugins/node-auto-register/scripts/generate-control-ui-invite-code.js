#!/usr/bin/env node

/**
 * OpenClaw Invite Code Generator for Control UI
 *
 * 生成 Control UI 专用的邀请码
 *
 * 用法:
 *   node scripts/generate-control-ui-invite-code.js [code-name]
 *
 * 环境变量:
 *   OPENCLAW_DIR - OpenClaw 配置目录，默认 ~/.openclaw
 *   OPENCLAW_PORT_OFFSET - 端口偏移量，默认 0（多实例部署时使用，如 100 表示端口 +100）
 *   OPENCLAW_GATEWAY_PORT - Gateway 基础端口，默认 18789
 *   INVITE_EXPIRY_DAYS - 邀请码过期天数，默认 365 (Control UI 邀请码长期有效)
 *   INVITE_MAX_USES - 最大使用次数，默认 999 (允许多次使用)
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const INVITE_CODE_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 365; // Control UI 邀请码默认 1 年有效
const DEFAULT_MAX_USES = 999;    // 允许多次使用

/**
 * 生成邀请码
 */
function generateInviteCode() {
  return randomBytes(INVITE_CODE_BYTES).toString('base64url');
}

/**
 * 获取邀请码文件路径
 */
function getInviteCodeFilePath() {
  const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw');
  return path.join(openclawDir, 'invite-codes.json');
}

/**
 * 读取邀请码列表
 */
function loadInviteCodes() {
  const filePath = getInviteCodeFilePath();
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

/**
 * 保存邀请码列表
 */
function saveInviteCodes(codes) {
  const filePath = getInviteCodeFilePath();
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(codes, null, 2), 'utf-8');
}

/**
 * 生成 Control UI 访问 URL
 * 注意：不再需要 token 参数，用户只需访问带 inviteCode 的 URL 即可
 * 支持端口偏移：实际端口 = 基础端口 + PORT_OFFSET
 */
function generateControlUiUrl(inviteCode, gatewayPort) {
  // 如果 gatewayPort 参数已传入，说明已经是计算后的端口，直接使用
  // 否则从环境变量读取并计算
  if (gatewayPort) {
    return `http://127.0.0.1:${gatewayPort}/?inviteCode=${inviteCode}&session=main`;
  }
  const portOffset = parseInt(process.env.OPENCLAW_PORT_OFFSET || '0', 10);
  const basePort = 18789;
  const port = basePort + portOffset;

  return `http://127.0.0.1:${port}/?inviteCode=${inviteCode}&session=main`;
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const codeName = args[0] || `control-ui-${Date.now()}`;

  // 解析参数
  const portOffset = parseInt(process.env.OPENCLAW_PORT_OFFSET || '0', 10);
  const expiryDays = parseInt(process.env.INVITE_EXPIRY_DAYS || DEFAULT_EXPIRY_DAYS, 10);
  const maxUses = parseInt(process.env.INVITE_MAX_USES || DEFAULT_MAX_USES, 10);
  const basePort = process.env.OPENCLAW_GATEWAY_PORT || 18789;
  const gatewayPort = basePort + portOffset;

  // 生成邀请码
  const inviteCode = generateInviteCode();

  // 读取现有邀请码
  const codes = loadInviteCodes();

  // 添加新邀请码
  codes[codeName] = {
    code: inviteCode,
    createdAt: Date.now(),
    expiresAt: Date.now() + (expiryDays * 24 * 60 * 60 * 1000),
    maxUses,
    usedCount: 0,
    active: true,
    description: process.env.INVITE_DESCRIPTION || 'Control UI auto-pair invite code',
    kind: 'control-ui', // 标记为 Control UI 专用
  };

  // 保存
  saveInviteCodes(codes);

  // 生成访问 URL（不再需要 token）
  const accessUrl = generateControlUiUrl(inviteCode, gatewayPort);

  // 输出结果
  console.log('='.repeat(70));
  console.log('OpenClaw Control UI Invite Code Generated');
  console.log('='.repeat(70));
  console.log(`Code Name:    ${codeName}`);
  console.log(`Invite Code:  ${inviteCode}`);
  console.log(`Port Offset:  ${portOffset === 0 ? 'None' : '+' + portOffset}`);
  console.log(`Gateway Port: ${gatewayPort}`);
  console.log(`Expires:      ${new Date(codes[codeName].expiresAt).toISOString()}`);
  console.log(`Max Uses:     ${maxUses}`);
  console.log('='.repeat(70));
  console.log();
  console.log('Access URL:');
  console.log(`  ${accessUrl}`);
  console.log();
  console.log('Usage:');
  console.log('  1. Open the Access URL in your browser');
  console.log('  2. The device will be automatically paired');
  console.log('  3. You can then use the Control UI normally');
  console.log();
  console.log('Manage codes:');
  console.log('  node scripts/manage-invite-codes.js list');
  console.log('  node scripts/manage-invite-codes.js revoke <code-name>');
  console.log();
}

main();
