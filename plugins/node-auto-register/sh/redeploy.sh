#!/bin/bash
#
# Node Auto-Register 插件重新部署脚本
# 用于在测试服务器上快速清理并重新部署插件
#
# 用法:
#   ./redeploy.sh                    # 使用默认配置重新部署
#   ./redeploy.sh --instance gw1     # 指定实例名称
#   ./redeploy.sh --cleanup-only     # 仅清理，不部署
#   ./redeploy.sh --help             # 显示帮助信息
#

set -e

# 默认配置
INSTANCE_ID="${OPENCLAW_INSTANCE_ID:-gw1}"
CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-/data/openclaw/openclaw_instances/${INSTANCE_ID}}"
INSTANCE_BASE_DIR="${OPENCLAW_INSTANCE_BASE_DIR:-/data/openclaw/openclaw_instances/}"
PORT_OFFSET="${OPENCLAW_PORT_OFFSET:-100}"
WORKSPACE_DIR="/data/workspace/openclaw"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "${BLUE}=============================================${NC}"; }

show_help() {
  cat << EOF
Node Auto-Register 插件重新部署脚本

用法: $0 [选项]

选项:
  --instance ID        指定实例名称 (默认：gw1)
  --config-dir DIR     指定配置目录 (默认：/data/openclaw/openclaw_instances/\${INSTANCE_ID})
  --port-offset NUM    指定端口偏移 (默认：100)
  --cleanup-only       仅清理容器和配置，不重新部署
  --skip-build         跳过镜像构建 (使用现有镜像)
  --help               显示此帮助信息

环境变量:
  OPENCLAW_INSTANCE_ID     实例名称
  OPENCLAW_CONFIG_DIR      配置目录
  OPENCLAW_INSTANCE_BASE_DIR  实例基础目录
  OPENCLAW_PORT_OFFSET     端口偏移

示例:
  $0                              # 使用默认配置重新部署
  $0 --instance gw2               # 部署 gw2 实例
  $0 --cleanup-only               # 仅清理
  $0 --skip-build                 # 跳过镜像构建

EOF
}

# 解析参数
CLEANUP_ONLY=0
SKIP_BUILD=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance)
      INSTANCE_ID="$2"
      CONFIG_DIR="/data/openclaw/openclaw_instances/${INSTANCE_ID}"
      shift 2
      ;;
    --config-dir)
      CONFIG_DIR="$2"
      shift 2
      ;;
    --port-offset)
      PORT_OFFSET="$2"
      shift 2
      ;;
    --cleanup-only)
      CLEANUP_ONLY=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
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

# 确认配置
log_header
log_info "Node Auto-Register 重新部署"
log_header
echo ""
log_info "配置:"
echo "  实例名称：$INSTANCE_ID"
echo "  配置目录：$CONFIG_DIR"
echo "  实例基础目录：$INSTANCE_BASE_DIR"
echo "  端口偏移：$PORT_OFFSET"
echo "  工作目录：$WORKSPACE_DIR"
echo ""

# 清理容器
log_header
log_info "步骤 1: 清理现有容器..."
log_header

if [ -f "${WORKSPACE_DIR}/cleanup-instance.sh" ]; then
  echo "y" | OPENCLAW_CONFIG_DIR="$CONFIG_DIR" "${WORKSPACE_DIR}/cleanup-instance.sh" "$INSTANCE_ID"
  log_info "清理完成"
else
  log_error "找不到 cleanup-instance.sh 脚本"
  exit 1
fi

echo ""

# 同步插件代码到实例 workspace 目录
log_header
log_info "步骤 1.5: 同步插件代码到实例 workspace..."
log_header

INSTANCE_WORKSPACE_DIR="${INSTANCE_BASE_DIR}${INSTANCE_ID}/workspace"
log_info "源目录：$WORKSPACE_DIR"
log_info "目标目录：$INSTANCE_WORKSPACE_DIR"

mkdir -p "$INSTANCE_WORKSPACE_DIR/plugins"
cp -r "$WORKSPACE_DIR/plugins/node-auto-register" "$INSTANCE_WORKSPACE_DIR/plugins/"
log_info "插件代码同步完成"

echo ""

# 仅清理模式
if [ $CLEANUP_ONLY -eq 1 ]; then
  log_info "仅清理模式，退出"
  exit 0
fi

# 重新部署
log_header
log_info "步骤 2: 重新部署实例..."
log_header

DEPLOY_CMD="OPENCLAW_INSTANCE_ID=${INSTANCE_ID} OPENCLAW_CONFIG_DIR=${CONFIG_DIR} OPENCLAW_INSTANCE_BASE_DIR=${INSTANCE_BASE_DIR} OPENCLAW_PORT_OFFSET=${PORT_OFFSET} OPENCLAW_NO_ONBOARD=true "

if [ $SKIP_BUILD -eq 1 ]; then
  DEPLOY_CMD="${DEPLOY_CMD}OPENCLAW_SKIP_BUILD=true "
fi

DEPLOY_CMD="${DEPLOY_CMD}${WORKSPACE_DIR}/docker-instance-setup.sh"

eval "$DEPLOY_CMD"

log_info "部署完成"
echo ""

# 验证部署
log_header
log_info "步骤 3: 验证部署..."
log_header

CONTAINER_NAME="openclaw-${INSTANCE_ID}-openclaw-gateway-1"

if docker ps --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
  log_info "容器 $CONTAINER_NAME 正在运行"

  # 检查插件日志
  log_info "检查插件加载状态..."
  sleep 3
  docker logs "$CONTAINER_NAME" 2>&1 | grep -E "(node-auto-register|one-shot-pair)" | tail -10

  log_info "✅ 部署验证通过"
else
  log_error "容器 $CONTAINER_NAME 未运行"
  exit 1
fi

log_header
echo ""
log_info "🎉 重新部署成功完成!"
echo ""

# 生成 Control UI 邀请码
log_info "生成 Control UI 邀请码..."
GATEWAY_PORT=$((18789 + PORT_OFFSET))
INVITE_OUTPUT="$(docker exec $CONTAINER_NAME node /app/dist/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js redeploy-$(date +%s) 2>&1 || true)"

INVITE_CODE=""
if echo "$INVITE_OUTPUT" | grep -q "Invite Code:"; then
  INVITE_CODE="$(echo "$INVITE_OUTPUT" | grep "Invite Code:" | awk '{print $3}')"
fi

if [ -n "$INVITE_CODE" ]; then
  log_info "访问 URL:"
  echo "  http://127.0.0.1:${GATEWAY_PORT}/control-ui/?inviteCode=${INVITE_CODE}&session=main"
  echo ""
else
  log_warn "无法生成邀请码，使用占位符"
  log_info "访问 URL:"
  echo "  http://127.0.0.1:${GATEWAY_PORT}/control-ui/?inviteCode=<CODE>&session=main"
  echo ""
fi

log_info "管理命令:"
echo "  查看日志：docker logs -f $CONTAINER_NAME"
echo "  清理实例：OPENCLAW_CONFIG_DIR=${CONFIG_DIR} ${WORKSPACE_DIR}/cleanup-instance.sh ${INSTANCE_ID}"
echo "  查看邀请码：docker exec $CONTAINER_NAME node /home/node/.openclaw/workspace/plugins/node-auto-register/scripts/manage-invite-codes.js list"
echo ""
