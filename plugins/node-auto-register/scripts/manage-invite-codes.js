#!/usr/bin/env node

/**
 * OpenClaw Invite Code Manager
 *
 * 管理邀请码（列出、撤销、查看）
 *
 * 用法:
 *   node manage-invite-codes.js list
 *   node manage-invite-codes.js revoke <code-name>
 *   node manage-invite-codes.js info <code-name>
 */

import fs from 'node:fs';
import path from 'node:path';

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
 * 列出所有邀请码
 */
function listCodes() {
  const codes = loadInviteCodes();
  const now = Date.now();

  console.log('='.repeat(80));
  console.log('OpenClaw Invite Codes');
  console.log('='.repeat(80));
  console.log();

  const entries = Object.entries(codes);
  if (entries.length === 0) {
    console.log('No invite codes found.');
    return;
  }

  console.log(`${'Name'.padEnd(25)} ${'Status'.padEnd(10)} ${'Uses'.padEnd(10)} ${'Expires'.padEnd(25)}`);
  console.log('-'.repeat(80));

  for (const [name, data] of entries) {
    const isExpired = data.expiresAt < now;
    const isMaxUsesReached = data.usedCount >= data.maxUses;
    const isActive = data.active && !isExpired && !isMaxUsesReached;

    const status = isActive ? 'active' : isExpired ? 'expired' : isMaxUsesReached ? 'maxed' : 'revoked';
    const uses = `${data.usedCount}/${data.maxUses}`;
    const expires = new Date(data.expiresAt).toISOString();

    console.log(`${name.padEnd(25)} ${status.padEnd(10)} ${uses.padEnd(10)} ${expires.padEnd(25)}`);
  }

  console.log();
}

/**
 * 撤销邀请码
 */
function revokeCode(codeName) {
  const codes = loadInviteCodes();

  if (!codes[codeName]) {
    console.error(`Error: Invite code "${codeName}" not found.`);
    process.exit(1);
  }

  codes[codeName].active = false;
  saveInviteCodes(codes);

  console.log(`Invite code "${codeName}" has been revoked.`);
}

/**
 * 查看邀请码详情
 */
function infoCode(codeName) {
  const codes = loadInviteCodes();

  if (!codes[codeName]) {
    console.error(`Error: Invite code "${codeName}" not found.`);
    process.exit(1);
  }

  const data = codes[codeName];
  const now = Date.now();
  const isExpired = data.expiresAt < now;
  const isMaxUsesReached = data.usedCount >= data.maxUses;
  const isActive = data.active && !isExpired && !isMaxUsesReached;

  console.log('='.repeat(60));
  console.log(`Invite Code: ${codeName}`);
  console.log('='.repeat(60));
  console.log(`Code:          ${data.code}`);
  console.log(`Status:        ${isActive ? 'Active' : isExpired ? 'Expired' : isMaxUsesReached ? 'Max Uses Reached' : 'Revoked'}`);
  console.log(`Created:       ${new Date(data.createdAt).toISOString()}`);
  console.log(`Expires:       ${new Date(data.expiresAt).toISOString()}`);
  console.log(`Max Uses:      ${data.maxUses}`);
  console.log(`Used Count:    ${data.usedCount}`);
  console.log(`Description:   ${data.description || 'N/A'}`);
  console.log();
}

/**
 * 清理过期邀请码
 */
function cleanupExpired() {
  const codes = loadInviteCodes();
  const now = Date.now();
  let cleaned = 0;

  for (const [name, data] of Object.entries(codes)) {
    if (data.expiresAt < now) {
      delete codes[name];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    saveInviteCodes(codes);
    console.log(`Cleaned up ${cleaned} expired invite code(s).`);
  } else {
    console.log('No expired invite codes to clean up.');
  }
}

/**
 * 主函数
 */
function main() {
  const [command, arg] = process.argv.slice(2);

  switch (command) {
    case 'list':
      listCodes();
      break;
    case 'revoke':
      if (!arg) {
        console.error('Error: Code name required.');
        console.error('Usage: node manage-invite-codes.js revoke <code-name>');
        process.exit(1);
      }
      revokeCode(arg);
      break;
    case 'info':
      if (!arg) {
        console.error('Error: Code name required.');
        console.error('Usage: node manage-invite-codes.js info <code-name>');
        process.exit(1);
      }
      infoCode(arg);
      break;
    case 'cleanup':
      cleanupExpired();
      break;
    default:
      console.log('OpenClaw Invite Code Manager');
      console.log();
      console.log('Usage:');
      console.log('  node manage-invite-codes.js list      - List all invite codes');
      console.log('  node manage-invite-codes.js info      - Show code details');
      console.log('  node manage-invite-codes.js revoke    - Revoke a code');
      console.log('  node manage-invite-codes.js cleanup   - Remove expired codes');
      console.log();
  }
}

main();
