#!/bin/bash
#
# 端口偏移配置测试 - TC-001
# 测试 generate-control-ui-invite-code.js 脚本的端口偏移功能
#

set -e

# 配置
SSH_HOST="${SSH_HOST:-root@192.168.90.6}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

PASS=0
FAIL=0

assert_url_port() {
  local output="$1"
  local expected_port="$2"
  local test_name="$3"

  if echo "$output" | grep -q ":${expected_port}/"; then
    log_info "✅ PASS: $test_name (端口 $expected_port)"
    ((PASS++))
  else
    log_error "❌ FAIL: $test_name (期望端口 $expected_port)"
    echo "实际输出：$output"
    ((FAIL++))
  fi
}

echo "=============================================="
echo " TC-001: 端口偏移配置测试"
echo "=============================================="
echo ""

# 步骤 1: 无端口偏移测试
log_info "步骤 1: 无端口偏移测试..."
OUTPUT=$(ssh $SSH_HOST "unset OPENCLAW_PORT_OFFSET && node /data/workspace/openclaw/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-no-offset" 2>/dev/null)
assert_url_port "$OUTPUT" "18789" "无偏移时端口应为 18789"
echo ""

# 步骤 2: PORT_OFFSET=100 测试
log_info "步骤 2: PORT_OFFSET=100 测试..."
OUTPUT=$(ssh $SSH_HOST "OPENCLAW_PORT_OFFSET=100 node /data/workspace/openclaw/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-offset-100" 2>/dev/null)
assert_url_port "$OUTPUT" "18889" "偏移 100 时端口应为 18889"
echo ""

# 步骤 3: PORT_OFFSET=200 测试
log_info "步骤 3: PORT_OFFSET=200 测试..."
OUTPUT=$(ssh $SSH_HOST "OPENCLAW_PORT_OFFSET=200 node /data/workspace/openclaw/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-offset-200" 2>/dev/null)
assert_url_port "$OUTPUT" "18989" "偏移 200 时端口应为 18989"
echo ""

# 步骤 4: 验证 URL 格式
log_info "步骤 4: 验证 URL 格式..."
OUTPUT=$(ssh $SSH_HOST "OPENCLAW_PORT_OFFSET=100 node /data/workspace/openclaw/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-url-format" 2>/dev/null)

if echo "$OUTPUT" | grep -q "inviteCode="; then
  log_info "✅ PASS: URL 包含 inviteCode 参数"
  ((PASS++))
else
  log_error "❌ FAIL: URL 不包含 inviteCode 参数"
  ((FAIL++))
fi

if echo "$OUTPUT" | grep -q "session=main"; then
  log_info "✅ PASS: URL 包含 session=main 参数"
  ((PASS++))
else
  log_error "❌ FAIL: URL 不包含 session=main 参数"
  ((FAIL++))
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
