#!/bin/bash
#
# 配对状态文件测试 - TC-005
# 验证设备配对状态文件的正确管理
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

assert_json_valid() {
  local json="$1"
  local test_name="$2"

  if echo "$json" | node -e 'JSON.parse(require("fs").readFileSync(0, "utf-8"))' 2>/dev/null; then
    log_info "✅ PASS: $test_name"
    ((PASS++))
  else
    log_error "❌ FAIL: $test_name (JSON 无效)"
    ((FAIL++))
  fi
}

assert_json_has_field() {
  local json="$1"
  local field="$2"
  local test_name="$3"

  if echo "$json" | grep -q "\"$field\""; then
    log_info "✅ PASS: $test_name"
    ((PASS++))
  else
    log_error "❌ FAIL: $test_name (缺少字段 $field)"
    ((FAIL++))
  fi
}

echo "=============================================="
echo " TC-005: 配对状态文件测试"
echo "=============================================="
echo ""

# 步骤 0: 清理现有状态文件（干净测试）
log_info "步骤 0: 清理现有状态文件..."
ssh $SSH_HOST "rm -rf /home/node/.openclaw/devices/ 2>/dev/null || true"
log_info "已清理 devices 目录"
echo ""

# 步骤 1: 首次调用一键配对 API
log_info "步骤 1: 生成邀请码并调用一键配对 API..."
INVITE_OUTPUT=$(ssh $SSH_HOST "node /data/workspace/openclaw/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-tc005" 2>/dev/null)
INVITE_CODE=$(echo "$INVITE_OUTPUT" | grep -oP '邀请码：\K\S+' || true)

if [ -z "$INVITE_CODE" ]; then
  log_error "无法生成邀请码，退出测试"
  exit 1
fi

log_info "邀请码：$INVITE_CODE"

PAIR_RESPONSE=$(ssh $SSH_HOST "curl -s 'http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair?inviteCode=$INVITE_CODE'")
echo "配对响应：$PAIR_RESPONSE"

if echo "$PAIR_RESPONSE" | grep -q '"ok":true'; then
  log_info "✅ PASS: 一键配对 API 调用成功"
  ((PASS++))
else
  log_error "❌ FAIL: 一键配对 API 调用失败"
  ((FAIL++))
fi
echo ""

# 步骤 2: 检查 devices 目录结构
log_info "步骤 2: 检查 devices 目录结构..."
DIR_LIST=$(ssh $SSH_HOST "ls -la /home/node/.openclaw/devices/ 2>/dev/null" || echo "")

if [ -n "$DIR_LIST" ]; then
  log_info "devices 目录内容:"
  echo "$DIR_LIST"
  log_info "✅ PASS: devices 目录已创建"
  ((PASS++))
else
  log_error "❌ FAIL: devices 目录未创建"
  ((FAIL++))
fi
echo ""

# 步骤 3: 检查 pending.json 内容
log_info "步骤 3: 检查 pending.json 内容..."
PENDING=$(ssh $SSH_HOST "cat /home/node/.openclaw/devices/pending.json 2>/dev/null || echo '{}'")
echo "pending.json 内容：$PENDING"

# pending.json 应该为空或有效 JSON（配对请求已批准并移除）
assert_json_valid "$PENDING" "pending.json 是有效的 JSON"
echo ""

# 步骤 4: 检查 paired.json 内容
log_info "步骤 4: 检查 paired.json 内容..."
PAIRED=$(ssh $SSH_HOST "cat /home/node/.openclaw/devices/paired.json 2>/dev/null || echo '{}'")
echo "paired.json 内容:"
echo "$PAIRED" | head -30

if [ "$PAIRED" != "{}" ] && [ -n "$PAIRED" ]; then
  assert_json_valid "$PAIRED" "paired.json 是有效的 JSON"
  assert_json_has_field "$PAIRED" "deviceId" "paired.json 包含 deviceId 字段"
  assert_json_has_field "$PAIRED" "tokens" "paired.json 包含 tokens 字段"
  assert_json_has_field "$PAIRED" "operator" "paired.json 包含 operator role"
else
  log_error "❌ FAIL: paired.json 为空或未创建"
  ((FAIL+=4))
fi
echo ""

# 步骤 5: 验证并发写入（可选，耗时较长）
log_info "步骤 5: 验证并发写入（可选测试）..."
log_warn "此测试可能耗时较长，跳过？(设置 SKIP_CONCURRENT=1 跳过)"

if [ "${SKIP_CONCURRENT:-0}" != "1" ]; then
  # 生成新的邀请码用于并发测试
  INVITE_OUTPUT2=$(ssh $SSH_HOST "node /data/workspace/openclaw/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-tc005-concurrent" 2>/dev/null)
  INVITE_CODE2=$(echo "$INVITE_OUTPUT2" | grep -oP '邀请码：\K\S+' || true)

  if [ -n "$INVITE_CODE2" ]; then
    log_info "发起 5 个并发配对请求..."
    for i in {1..5}; do
      ssh $SSH_HOST "curl -s 'http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair?inviteCode=$INVITE_CODE2' > /dev/null &"
    done
    sleep 3

    # 检查 paired.json 是否仍然有效
    PAIRED_AFTER=$(ssh $SSH_HOST "cat /home/node/.openclaw/devices/paired.json 2>/dev/null || echo '{}'")
    assert_json_valid "$PAIRED_AFTER" "并发写入后 paired.json 仍然有效"
  else
    log_warn "⚠️  跳过：无法生成并发测试邀请码"
  fi
else
  log_info "已跳过并发测试"
fi
echo ""

# 步骤 6: 验证文件路径与 OpenClaw 核心一致
log_info "步骤 6: 验证文件路径..."
PENDING_PATH=$(ssh $SSH_HOST "ls /home/node/.openclaw/devices/pending.json 2>/dev/null || echo ''")
PAIRED_PATH=$(ssh $SSH_HOST "ls /home/node/.openclaw/devices/paired.json 2>/dev/null || echo ''")

if [ -n "$PENDING_PATH" ]; then
  log_info "✅ PASS: pending.json 路径正确 (devices/pending.json)"
  ((PASS++))
else
  log_warn "⚠️  pending.json 可能为空或被清理（正常行为）"
fi

if [ -n "$PAIRED_PATH" ]; then
  log_info "✅ PASS: paired.json 路径正确 (devices/paired.json)"
  ((PASS++))
else
  log_error "❌ FAIL: paired.json 路径不正确"
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
