#!/bin/bash
#
# 一键配对 API 测试 - TC-003
# 测试 /plugins/node-auto-register/api/one-shot-pair 端点
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
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 测试结果计数
PASS=0
FAIL=0

# 测试断言
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

assert_not_contains() {
  local response="$1"
  local unexpected="$2"
  local test_name="$3"

  if ! echo "$response" | grep -q "$unexpected"; then
    log_info "✅ PASS: $test_name"
    ((PASS++))
  else
    log_error "❌ FAIL: $test_name (unexpected: $unexpected)"
    ((FAIL++))
  fi
}

echo "=============================================="
echo " TC-003: 一键配对 API 测试"
echo "=============================================="
echo ""

# 步骤 1: 生成邀请码
log_info "步骤 1: 生成测试邀请码..."
INVITE_OUTPUT=$(ssh $SSH_HOST "node /data/workspace/openclaw/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-tc003" 2>/dev/null)
INVITE_CODE=$(echo "$INVITE_OUTPUT" | grep -oP 'Invite Code:\s*\K\S+' || true)

if [ -z "$INVITE_CODE" ]; then
  log_error "无法生成邀请码，退出测试"
  exit 1
fi

log_info "邀请码：$INVITE_CODE"
echo ""

# 步骤 2: 测试有效邀请码
log_info "步骤 2: 测试有效邀请码..."
RESPONSE=$(ssh $SSH_HOST "curl -s 'http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair?inviteCode=$INVITE_CODE'")
echo "响应：$RESPONSE"
assert_contains "$RESPONSE" '"ok":true' "有效邀请码返回 ok:true"
assert_contains "$RESPONSE" '"paired":true' "有效邀请码返回 paired:true"
assert_contains "$RESPONSE" '"deviceId"' "响应包含 deviceId"
assert_contains "$RESPONSE" '"deviceToken"' "响应包含 deviceToken"
assert_contains "$RESPONSE" '"operator"' "响应包含 role"
echo ""

# 步骤 3: 测试无效邀请码
log_info "步骤 3: 测试无效邀请码..."
RESPONSE=$(ssh $SSH_HOST "curl -s 'http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair?inviteCode=invalid_code_xyz'")
echo "响应：$RESPONSE"
assert_contains "$RESPONSE" '"ok":false' "无效邀请码返回 ok:false"
assert_contains "$RESPONSE" 'error' "响应包含 error 字段"
assert_contains "$RESPONSE" 'invalid or expired' "错误信息包含 invalid or expired"
echo ""

# 步骤 4: 测试缺失邀请码参数
log_info "步骤 4: 测试缺失邀请码参数..."
RESPONSE=$(ssh $SSH_HOST "curl -s 'http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair'")
echo "响应：$RESPONSE"
assert_contains "$RESPONSE" '"ok":false' "缺失参数返回 ok:false"
assert_contains "$RESPONSE" 'inviteCode is required' "错误信息包含 inviteCode is required"
echo ""

# 步骤 5: 测试空字符串邀请码
log_info "步骤 5: 测试空字符串邀请码..."
RESPONSE=$(ssh $SSH_HOST "curl -s 'http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair?inviteCode='")
echo "响应：$RESPONSE"
assert_contains "$RESPONSE" '"ok":false' "空邀请码返回 ok:false"
echo ""

# 步骤 6: 验证配对状态文件
log_info "步骤 6: 验证配对状态文件..."
PENDING=$(ssh $SSH_HOST "cat /home/node/.openclaw/devices/pending.json 2>/dev/null || echo '{}'")
PAIRED=$(ssh $SSH_HOST "cat /home/node/.openclaw/devices/paired.json 2>/dev/null || echo '{}'")

if [ "$PAIRED" != "{}" ] && [ -n "$PAIRED" ]; then
  log_info "✅ paired.json 包含设备记录"
  ((PASS++))
else
  log_warn "⚠️  paired.json 为空或未创建"
fi
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
