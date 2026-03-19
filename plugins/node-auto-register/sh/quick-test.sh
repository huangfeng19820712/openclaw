#!/bin/bash
#
# Node Auto-Register 快速测试脚本
# 用于快速验证一键配对 API 是否正常工作
#
# 用法:
#   ./quick-test.sh                    # 运行快速测试
#   ./quick-test.sh --port 18889       # 指定端口
#   ./quick-test.sh --full             # 运行完整测试
#

set -e

# 默认配置
PORT="${PORT:-18889}"
CONTAINER_NAME="${CONTAINER_NAME:-openclaw-gw1-openclaw-gateway-1}"
FULL_TEST=0

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

show_help() {
  cat << EOF
Node Auto-Register 快速测试脚本

用法: $0 [选项]

选项:
  --port PORT      指定端口 (默认：18889)
  --full           运行完整测试（包括状态文件验证）
  --help           显示帮助信息

示例:
  $0                      # 快速测试
  $0 --port 18989         # 指定端口测试
  $0 --full               # 完整测试

EOF
}

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --port)
      PORT="$2"
      shift 2
      ;;
    --full)
      FULL_TEST=1
      shift
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      log_error "未知参数：$1"
      show_help
      exit 1
      ;;
  esac
done

log_info "开始快速测试..."
echo ""
echo "配置：端口=$PORT, 容器=$CONTAINER_NAME"
echo ""

# 生成邀请码
log_info "步骤 1: 生成邀请码..."
INVITE_OUTPUT=$(docker exec "$CONTAINER_NAME" node /home/node/.openclaw/workspace/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js quick-test 2>&1)
INVITE_CODE=$(echo "$INVITE_OUTPUT" | grep -oP 'Invite Code:\s*\K\S+' || true)

if [ -z "$INVITE_CODE" ]; then
  log_error "无法生成邀请码"
  exit 1
fi

log_info "邀请码：$INVITE_CODE"
echo ""

# 测试 1: 有效邀请码
log_info "步骤 2: 测试有效邀请码..."
RESPONSE=$(curl -s "http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair?inviteCode=$INVITE_CODE")
echo "响应：$RESPONSE"

if echo "$RESPONSE" | grep -q '"ok":true'; then
  log_info "✅ PASS: 有效邀请码测试通过"
  ((PASS++))
else
  log_error "❌ FAIL: 有效邀请码测试失败"
  ((FAIL++))
fi
echo ""

# 测试 2: 无效邀请码
log_info "步骤 3: 测试无效邀请码..."
RESPONSE=$(curl -s "http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair?inviteCode=invalid_code")
echo "响应：$RESPONSE"

if echo "$RESPONSE" | grep -q '"ok":false'; then
  log_info "✅ PASS: 无效邀请码测试通过"
  ((PASS++))
else
  log_error "❌ FAIL: 无效邀请码测试失败"
  ((FAIL++))
fi
echo ""

# 测试 3: 缺失参数
log_info "步骤 4: 测试缺失参数..."
RESPONSE=$(curl -s "http://127.0.0.1:$PORT/plugins/node-auto-register/api/one-shot-pair")
echo "响应：$RESPONSE"

if echo "$RESPONSE" | grep -q 'inviteCode is required'; then
  log_info "✅ PASS: 缺失参数测试通过"
  ((PASS++))
else
  log_error "❌ FAIL: 缺失参数测试失败"
  ((FAIL++))
fi
echo ""

# 完整测试模式
if [ $FULL_TEST -eq 1 ]; then
  # 测试 5: 验证 paired.json
  log_info "步骤 5: 验证配对状态文件..."
  PAIRED=$(docker exec "$CONTAINER_NAME" cat /home/node/.openclaw/devices/paired.json 2>/dev/null || echo '{}')

  if [ "$PAIRED" != "{}" ] && [ -n "$PAIRED" ]; then
    log_info "✅ PASS: paired.json 包含设备记录"
    ((PASS++))

    # 显示最新配对的设备
    log_info "最新配对设备:"
    echo "$PAIRED" | head -20
  else
    log_warn "⚠️  paired.json 为空或未创建"
  fi
  echo ""

  # 测试 6: 容器日志检查
  log_info "步骤 6: 检查插件日志..."
  LOGS=$(docker logs "$CONTAINER_NAME" 2>&1 | grep -E "\[one-shot-pair\]" | tail -5)

  if [ -n "$LOGS" ]; then
    log_info "✅ PASS: 插件日志正常"
    echo "$LOGS"
    ((PASS++))
  else
    log_warn "⚠️  未找到 one-shot-pair 日志"
  fi
  echo ""
fi

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
