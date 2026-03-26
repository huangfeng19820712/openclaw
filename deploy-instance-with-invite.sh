#!/usr/bin/env bash
# =============================================================================
# OpenClaw 实例一键部署脚本（带邀请码功能）
# =============================================================================
# 功能：
#   - 自动部署 OpenClaw 实例
#   - 自动复制 node-auto-register 插件
#   - 自动生成邀请码
#   - 输出访问 URL
#
# 使用方式：
#   ./deploy-instance-with-invite.sh <instance_name>
#
# 示例：
#   ./deploy-instance-with-invite.sh gw1
#   ./deploy-instance-with-invite.sh test-node
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# 基础配置
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_SETUP_SCRIPT="$SCRIPT_DIR/docker-instance-setup.sh"
COPY_PLUGIN_SCRIPT="$SCRIPT_DIR/plugins/node-auto-register/sh/copy-to-extensions.sh"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_header()  { echo -e "${BLUE}=============================================${NC}"; }
log_step()    { echo -e "${CYAN}[STEP]${NC} $1"; }

show_help() {
  cat << EOF
OpenClaw 实例一键部署脚本（带邀请码功能）

用法：$0 <instance_name>

参数:
  instance_name - 实例名称（如：gw1, test-node, node-auto-register 等）

示例:
  $0 gw1              # 部署名为 gw1 的实例
  $0 test-node        # 部署名为 test-node 的实例

输出:
  - 容器名称
  - Gateway 访问地址
  - 邀请码访问 URL

依赖:
  - docker-instance-setup.sh (同目录)
  - copy-to-extensions.sh (plugins/node-auto-register/sh/)
EOF
}

# -----------------------------------------------------------------------------
# 参数检查
# -----------------------------------------------------------------------------
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  show_help
  exit 0
fi

if [[ -z "${1:-}" ]]; then
  log_error "缺少实例名称参数"
  echo ""
  show_help
  exit 1
fi

INSTANCE_ID="$1"

# -----------------------------------------------------------------------------
# 依赖检查
# -----------------------------------------------------------------------------
log_header
log_info "检查依赖脚本..."
log_header

if [[ ! -f "$INSTANCE_SETUP_SCRIPT" ]]; then
  log_error "找不到部署脚本：$INSTANCE_SETUP_SCRIPT"
  exit 1
else
  log_info "✓ 部署脚本存在：$INSTANCE_SETUP_SCRIPT"
fi

if [[ ! -f "$COPY_PLUGIN_SCRIPT" ]]; then
  log_error "找不到插件复制脚本：$COPY_PLUGIN_SCRIPT"
  exit 1
else
  log_info "✓ 插件复制脚本存在：$COPY_PLUGIN_SCRIPT"
fi

if ! command -v docker &> /dev/null; then
  log_error "Docker 未安装"
  exit 1
else
  log_info "✓ Docker 已安装"
fi

echo ""

# -----------------------------------------------------------------------------
# 步骤 1: 部署容器实例
# -----------------------------------------------------------------------------
log_header
log_step "步骤 1/3: 部署容器实例 '$INSTANCE_ID'..."
log_header

# 清理可能存在的残留容器和端口占用
log_info "清理残留容器和端口占用..."
EXISTING_CONTAINER=$(docker ps -aq --filter "name=openclaw-${INSTANCE_ID}-openclaw-gateway" 2>/dev/null || true)
if [[ -n "$EXISTING_CONTAINER" ]]; then
  docker stop "$EXISTING_CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$EXISTING_CONTAINER" >/dev/null 2>&1 || true
  log_info "已清理残留容器：$EXISTING_CONTAINER"
fi

# 等待端口释放
sleep 2

# 检测并终止占用端口的 docker-proxy 进程
GATEWAY_PORT_NUM=$(docker ps --format '{{.Names}}:{{.Ports}}' 2>/dev/null | \
  grep "openclaw-${INSTANCE_ID}" | \
  grep -oP '0\.0\.0\.0:\K[0-9]+' | head -1 || echo "")
if [[ -n "$GATEWAY_PORT_NUM" ]]; then
  pkill -9 -f "docker-proxy.*:${GATEWAY_PORT_NUM}" 2>/dev/null || true
  log_info "已清理端口 $GATEWAY_PORT_NUM 的占用进程"
fi

# 自动检测下一个可用的端口偏移量（基于已用端口）
log_info "检测已用端口..."
USED_PORTS=$(docker ps --format '{{.Ports}}' 2>/dev/null | \
  grep -oP '0\.0\.0\.0:\K[0-9]+' | sort -n | uniq || true)
MAX_PORT=0
for port in $USED_PORTS; do
  if [[ "$port" -ge 18789 && "$port" -lt 20000 ]]; then
    if [[ "$port" -gt "$MAX_PORT" ]]; then
      MAX_PORT="$port"
    fi
  fi
done

# 计算端口偏移（向下取整到 100 的倍数）
if [[ "$MAX_PORT" -gt 0 ]]; then
  OFFSET_BASE=$((MAX_PORT - 18789))
  DETECTED_OFFSET=$(( (OFFSET_BASE / 100 + 1) * 100 ))
  log_info "检测到最大端口：$MAX_PORT，使用偏移量：$DETECTED_OFFSET (Gateway 端口：$((18789 + DETECTED_OFFSET)))"
else
  DETECTED_OFFSET=0
  log_info "未检测到已用端口，使用默认偏移量：0"
fi

# 使用检测到的端口偏移部署
DEPLOY_OUTPUT=$(OPENCLAW_INSTANCE_ID="$INSTANCE_ID" \
OPENCLAW_NO_ONBOARD=true \
OPENCLAW_PORT_OFFSET="$DETECTED_OFFSET" \
  bash "$INSTANCE_SETUP_SCRIPT" 2>&1) || true

echo "$DEPLOY_OUTPUT"

# 检查部署是否成功
if echo "$DEPLOY_OUTPUT" | grep -qi "error\|failed\|cannot\|unable\|Bind for.*failed"; then
  log_error "部署失败，请检查上述错误信息"
  exit 1
fi

# 从输出中提取端口偏移和 Gateway 端口
PORT_OFFSET=$(echo "$DEPLOY_OUTPUT" | grep -oP 'Auto-detected port offset: \K[0-9]+' || echo "")
GATEWAY_PORT=$(echo "$DEPLOY_OUTPUT" | grep -oP 'Gateway port: \K[0-9]+' || echo "")

if [[ -n "$GATEWAY_PORT" ]]; then
  log_info "自动分配的 Gateway 端口：$GATEWAY_PORT"
elif [[ -n "$PORT_OFFSET" ]]; then
  GATEWAY_PORT=$((18789 + PORT_OFFSET))
  log_info "自动分配的 Gateway 端口：$GATEWAY_PORT (偏移量：$PORT_OFFSET)"
else
  # 从 docker port 命令获取
  GATEWAY_PORT=$(docker port "openclaw-${INSTANCE_ID}-openclaw-gateway-1" 18789 2>/dev/null | head -1 | cut -d: -f2 || echo "18789")
  if [[ -z "$GATEWAY_PORT" ]]; then
    GATEWAY_PORT="18789"
  fi
fi

# -----------------------------------------------------------------------------
# 容器名称
# -----------------------------------------------------------------------------
CONTAINER_NAME="openclaw-${INSTANCE_ID}-openclaw-gateway-1"

log_info "容器实例部署完成"
echo ""

# -----------------------------------------------------------------------------
# 步骤 2: 复制插件到 extensions 目录
# -----------------------------------------------------------------------------
log_header
log_step "步骤 2/3: 复制 node-auto-register 插件..."
log_header

bash "$COPY_PLUGIN_SCRIPT" "$INSTANCE_ID"

log_info "插件复制完成"
echo ""

# -----------------------------------------------------------------------------
# 步骤 3: 重启容器并等待启动
# -----------------------------------------------------------------------------
log_header
log_step "步骤 3/3: 重启容器并生成邀请码..."
log_header

log_info "重启容器：$CONTAINER_NAME"
docker restart "$CONTAINER_NAME"

log_info "等待容器启动 (10 秒)..."
sleep 10

# -----------------------------------------------------------------------------
# 生成邀请码
# -----------------------------------------------------------------------------
echo ""
log_info "生成邀请码..."

INVITE_CODE_NAME="deploy-$(date +%Y%m%d-%H%M%S)"
INVITE_OUTPUT=$(docker exec "$CONTAINER_NAME" \
  node /home/node/.openclaw/extensions/node-auto-register/scripts/generate-control-ui-invite-code.js "$INVITE_CODE_NAME" 2>&1)

# 提取邀请码和访问 URL
INVITE_CODE=$(echo "$INVITE_OUTPUT" | grep "Invite Code:" | awk '{print $NF}')
ACCESS_URL=$(echo "$INVITE_OUTPUT" | grep -A1 "Access URL:" | tail -1 | sed 's/^[[:space:]]*//')

if [[ -z "$INVITE_CODE" ]]; then
  log_error "邀请码生成失败"
  echo "$INVITE_OUTPUT"
  exit 1
fi

# -----------------------------------------------------------------------------
# 获取服务器 IP
# -----------------------------------------------------------------------------
SERVER_IP=$(hostname -I | awk '{print $1}' || echo "192.168.90.6")

# -----------------------------------------------------------------------------
# 输出结果
# -----------------------------------------------------------------------------
echo ""
log_header
log_info "✅ 部署完成！"
log_header

echo ""
echo -e "${CYAN}=============================================${NC}"
echo -e "${GREEN}实例信息${NC}"
echo -e "${CYAN}=============================================${NC}"
echo "  实例名称：  ${INSTANCE_ID}"
echo "  容器名称：  ${CONTAINER_NAME}"
echo "  Gateway 端口：${GATEWAY_PORT}"
echo ""
echo -e "${CYAN}=============================================${NC}"
echo -e "${GREEN}邀请码信息${NC}"
echo -e "${CYAN}=============================================${NC}"
echo "  邀请码名称：${INVITE_CODE_NAME}"
echo "  邀请码：    ${INVITE_CODE}"
echo ""
echo -e "${CYAN}=============================================${NC}"
echo -e "${GREEN}访问地址${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""
echo "  ${GREEN}➜${NC} ${BLUE}${ACCESS_URL}${NC}"
echo ""
echo "  或使用服务器 IP 访问："
echo "  ${GREEN}➜${NC} ${BLUE}http://${SERVER_IP}:${GATEWAY_PORT}/?inviteCode=${INVITE_CODE}&session=main${NC}"
echo ""
echo -e "${CYAN}=============================================${NC}"
echo ""
log_info "使用方法："
echo "  1. 在浏览器中打开上述任意 URL"
echo "  2. 设备将自动配对并登录"
echo "  3. 开始使用 Control UI"
echo ""
log_info "其他管理命令："
echo "  查看日志：docker logs -f $CONTAINER_NAME"
echo "  生成新邀请码：docker exec $CONTAINER_NAME node /home/node/.openclaw/extensions/node-auto-register/scripts/generate-control-ui-invite-code.js <名称>"
echo "  列出邀请码：docker exec $CONTAINER_NAME node /home/node/.openclaw/extensions/node-auto-register/scripts/manage-invite-codes.js list"
echo ""
