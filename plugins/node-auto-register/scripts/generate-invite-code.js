#!/usr/bin/env node

/**
 * OpenClaw Invite Code Generator (Simple Mode)
 *
 * 生成邀请码并保存到 ~/.openclaw/invite-codes.json
 *
 * Gateway 需要修改以支持邀请码验证
 *
 * 用法:
 *   node generate-invite-code.js [code-name]
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const INVITE_CODE_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 7;
const DEFAULT_MAX_USES = 1;

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
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const codeName = args[0] || `invite-${Date.now()}`;

  // 解析参数
  const expiryDays = parseInt(process.env.INVITE_EXPIRY_DAYS || DEFAULT_EXPIRY_DAYS, 10);
  const maxUses = parseInt(process.env.INVITE_MAX_USES || DEFAULT_MAX_USES, 10);

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
    description: process.env.INVITE_DESCRIPTION || '',
  };

  // 保存
  saveInviteCodes(codes);

  // 输出结果
  console.log('='.repeat(60));
  console.log('OpenClaw Invite Code Generated');
  console.log('='.repeat(60));
  console.log(`Code Name:    ${codeName}`);
  console.log(`Invite Code:  ${inviteCode}`);
  console.log(`Expires:      ${new Date(codes[codeName].expiresAt).toISOString()}`);
  console.log(`Max Uses:     ${maxUses}`);
  console.log('='.repeat(60));
  console.log();
  console.log('Usage on remote node:');
  console.log(`  node cli.js --invite-code ${inviteCode} --gateway <your-gateway-host>`);
  console.log();
  console.log('Note: Gateway must be configured to accept invite codes.');
  console.log('See CONFIG.md for gateway configuration.');
  console.log();
}

main();
