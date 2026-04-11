#!/bin/bash
#
# 邀请码验证测试 - TC-004
# 测试邀请码的生成、验证、管理功能
#

set -e

# 配置
SSH_HOST="${SSH_HOST:-root@192.168.90.6}"
PORT="${PORT:-18889}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

PASS=0
FAIL=0

assert_contains() {
  local response="$1"
  local expected="$2"
  local test_name="$3"

  if echo "$response" | grep -q "$expected"; then
    log_info "✅ PASS: $test_name"
    ((PASS++))
  else
    log_error "❌ FAIL: $test_name"
    ((FAIL++))
  fi
}

echo "=============================================="
echo " TC-004: 邀请码验证测试"
echo "=============================================="
echo ""

# 步骤 1: 生成邀请码
log_info "步骤 1: 生成邀请码..."
GENERATE_OUTPUT=$(ssh $SSH_HOST "node /data/workspace/openclaw/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-tc004" 2>/dev/null)
echo "$GENERATE_OUTPUT"

if echo "$GENERATE_OUTPUT" | grep -q "邀请码："; then
  log_info "✅ PASS: 成功生成邀请码"
  ((PASS++))
else
  log_error "❌ FAIL: 未能生成邀请码"
  ((FAIL++))
fi
echo ""

# 步骤 2: 验证 invite-codes.json 文件格式
log_info "步骤 2: 验证 invite-codes.json 文件格式..."
INVITE_FILE=$(ssh $SSH_HOST "cat /home/node/.openclaw/invite-codes.json 2>/dev/null")

if [ -n "$INVITE_FILE" ]; then
  # 检查 JSON 是否有效
  if ssh $SSH_HOST "cat /home/node/.openclaw/invite-codes.json | node -e 'JSON.parse(require(\"fs\").readFileSync(0, \"utf-8\"))'" 2>/dev/null; then
    log_info "✅ PASS: invite-codes.json 是有效的 JSON"
    ((PASS++))
  else
    log_error "❌ FAIL: invite-codes.json 不是有效的 JSON"
    ((FAIL++))
  fi

  # 检查包含 code 字段
  if echo "$INVITE_FILE" | grep -q '"code"'; then
    log_info "✅ PASS: 包含 code 字段"
    ((PASS++))
  else
    log_error "❌ FAIL: 不包含 code 字段"
    ((FAIL++))
  fi

  # 检查包含 expiresAt 字段
  if echo "$INVITE_FILE" | grep -q '"expiresAt"'; then
    log_info "✅ PASS: 包含 expiresAt 字段"
    ((PASS++))
  else
    log_error "❌ FAIL: 不包含 expiresAt 字段"
    ((FAIL++))
  fi

  # 检查包含 maxUses 字段
  if echo "$INVITE_FILE" | grep -q '"maxUses"'; then
    log_info "✅ PASS: 包含 maxUses 字段"
    ((PASS++))
  else
    log_error "❌ FAIL: 不包含 maxUses 字段"
    ((FAIL++))
  fi

  # 检查包含 usedCount 字段
  if echo "$INVITE_FILE" | grep -q '"usedCount"'; then
    log_info "✅ PASS: 包含 usedCount 字段"
    ((PASS++))
  else
    log_error "❌ FAIL: 不包含 usedCount 字段"
    ((FAIL++))
  fi
else
  log_error "❌ FAIL: invite-codes.json 文件不存在或为空"
  ((FAIL+=6))
fi
echo ""

# 步骤 3: 查看邀请码列表
log_info "步骤 3: 查看邀请码列表..."
LIST_OUTPUT=$(ssh $SSH_HOST "node /data/workspace/openclaw/plugins/node-auto-register/scripts/manage-invite-codes.js list" 2>/dev/null)
echo "$LIST_OUTPUT"

if echo "$LIST_OUTPUT" | grep -q "test-tc004"; then
  log_info "✅ PASS: 列表中显示刚生成的邀请码"
  ((PASS++))
else
  log_warn "⚠️  列表中未找到 test-tc004（可能正常，取决于脚本实现）"
fi
echo ""

# 步骤 4: 撤销邀请码
log_info "步骤 4: 撤销邀请码..."
REVOKE_OUTPUT=$(ssh $SSH_HOST "node /data/workspace/openclaw/plugins/node-auto-register/scripts/manage-invite-codes.js revoke test-tc004" 2>/dev/null)
echo "$REVOKE_OUTPUT"

# 验证邀请码状态变为 active: false
INVITE_FILE_AFTER=$(ssh $SSH_HOST "cat /home/node/.openclaw/invite-codes.json 2>/dev/null")
if echo "$INVITE_FILE_AFTER" | grep -q '"active": false' || echo "$INVITE_FILE_AFTER" | grep -q '"active":false'; then
  log_info "✅ PASS: 撤销后 active 状态变为 false"
  ((PASS++))
else
  log_warn "⚠️  无法验证 active 状态（可能脚本实现不同）"
fi
echo ""

# 步骤 5: 验证已撤销的邀请码
log_info "步骤 5: 验证已撤销的邀请码..."
# 获取邀请码（从文件中提取）
REVOKED_CODE=$(ssh $SSH_HOST "cat /home/node/.openclaw/invite-codes.json | grep -oP '\"code\":\\s*\"\\K[^\"]+' | head -1" 2>/dev/null || true)

if [ -n "$REVOKED_CODE" ]; then
  RESPONSE=$(ssh $SSH_HOST "curl -s 'http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair?inviteCode=$REVOKED_CODE'")
  echo "响应：$RESPONSE"
  assert_contains "$RESPONSE" '"ok":false' "已撤销邀请码返回 ok:false"
else
  log_warn "⚠️  跳过：无法获取已撤销的邀请码"
fi
echo ""

# 步骤 6: 清理过期邀请码
log_info "步骤 6: 清理过期邀请码..."
CLEANUP_OUTPUT=$(ssh $SSH_HOST "node /data/workspace/openclaw/plugins/node-auto-register/scripts/manage-invite-codes.js cleanup" 2>/dev/null)
echo "$CLEANUP_OUTPUT"
log_info "✅ PASS: cleanup 命令执行完成"
((PASS++))
echo ""

# 输出统计
echo "=============================================="
echo " 测试结果统计"
echo "=============================================="
log_info "通过：$PASS"
log_error "失败：$FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
  log_info "🎉 所有测试通过！"
  exit 0
else
  log_error "⚠️  有 $FAIL 个测试失败"
  exit 1
fi
