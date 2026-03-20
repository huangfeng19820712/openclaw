#!/usr/bin/env bash
# =============================================================================
# OpenClaw Node Auto-Register Plugin 快速重新部署脚本
# =============================================================================
# 用途：
#   - 快速更新容器内的插件代码（无需重新运行完整的 docker-setup.sh）
#   - 适用于开发调试和紧急修复
#
# 使用方式：
#   ./quick-redeploy-plugin.sh [INSTANCE_ID]
#
# 参数：
#   INSTANCE_ID - 实例标识，默认：default
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_ID="${1:-default}"
PORT_OFFSET="${OPENCLAW_PORT_OFFSET:-0}"
INSTANCE_BASE_DIR="${OPENCLAW_INSTANCE_BASE_DIR:-/data/openclaw/openclaw_instances/}"
CONFIG_DIR="${INSTANCE_BASE_DIR}${INSTANCE_ID}"
WORKSPACE_DIR="${CONFIG_DIR}/workspace"
COMPOSE_PROJECT_NAME="openclaw-${INSTANCE_ID}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

GATEWAY_PORT="$((18789 + PORT_OFFSET))"
BRIDGE_PORT="$((18790 + PORT_OFFSET))"

export COMPOSE_PROJECT_NAME

echo "========================================"
echo "OpenClaw Plugin Quick Redeploy"
echo "========================================"
echo "Instance ID:     $INSTANCE_ID"
echo "Port Offset:     $PORT_OFFSET"
echo "Gateway Port:    $GATEWAY_PORT"
echo "Config Dir:      $CONFIG_DIR"
echo "Workspace Dir:   $WORKSPACE_DIR"
echo "========================================"
echo ""

# 检查容器是否运行
CONTAINER_NAME="openclaw-gateway-1"
if ! docker ps --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
  # 尝试其他可能的容器名
  CONTAINER_NAME="$(docker ps --filter "name=openclaw.*gateway" --format '{{.Names}}' | head -1)"
  if [[ -z "$CONTAINER_NAME" ]]; then
    echo "ERROR: No running OpenClaw gateway container found"
    exit 1
  fi
fi

echo "==> Found container: $CONTAINER_NAME"

# 1. 复制插件到 workspace 目录
PLUGIN_WORKSPACE_DIR="$WORKSPACE_DIR/plugins/node-auto-register"
echo "    Copying plugin to $PLUGIN_WORKSPACE_DIR..."

if [[ ! -d "$PLUGIN_WORKSPACE_DIR" ]]; then
  mkdir -p "$(dirname "$PLUGIN_WORKSPACE_DIR")"
fi

# 使用 docker cp 复制文件
docker cp "$ROOT_DIR/plugins/node-auto-register" "$CONTAINER_NAME:/home/node/.openclaw/workspace/plugins/"

echo "    Plugin files copied successfully"

# 2. 重启插件（通过重启 gateway 或热重载）
echo ""
echo "==> Restarting gateway to reload plugin..."
docker compose -f "$COMPOSE_FILE" restart openclaw-gateway

# 等待网关重启
echo "    Waiting for gateway to restart..."
sleep 5

# 3. 注入自动配对脚本到 Control UI
echo ""
echo "==> Injecting auto-pair script to Control UI..."

# 在运行中的容器内执行注入脚本
INJECT_OUTPUT="$(docker exec "$CONTAINER_NAME" node /home/node/.openclaw/workspace/plugins/node-auto-register/scripts/inject-auto-pair-script.js inject 2>&1 || true)"

if echo "$INJECT_OUTPUT" | grep -qi "injected\|already"; then
  echo "    Auto-pair script injected successfully"
  echo "    $INJECT_OUTPUT"
else
  echo "    Warning: Could not inject auto-pair script"
  echo "    $INJECT_OUTPUT"
fi

# 4. 生成新的邀请码（带端口偏移）
echo ""
echo "==> Generating new Control UI invite code..."

INVITE_OUTPUT="$(docker exec "$CONTAINER_NAME" node -e "process.env.OPENCLAW_PORT_OFFSET='$PORT_OFFSET'" /home/node/.openclaw/workspace/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js quick-pair-$(date +%s) 2>&1 || true)"

if echo "$INVITE_OUTPUT" | grep -q "Invite Code:"; then
  INVITE_CODE="$(echo "$INVITE_OUTPUT" | grep "Invite Code:" | awk '{print $3}')"
  echo "    Invite code generated: ${INVITE_CODE:0:8}...${INVITE_CODE: -8}"
fi

if echo "$INVITE_OUTPUT" | grep -q "Access URL:"; then
  ACCESS_URL="$(echo "$INVITE_OUTPUT" | grep -A1 "Access URL:" | tail -1 | xargs)"
  echo ""
  echo "========================================"
  echo "Control UI Access URL:"
  echo "========================================"
  echo "$ACCESS_URL"
  echo "========================================"
  echo ""
fi

echo "========================================"
echo "Plugin redeploy completed!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Click the Access URL above to test auto-pairing"
echo "  2. Check browser console for [openclaw-auto-pair] logs"
echo "  3. Verify /plugins/node-auto-register/static/auto-pair.js loads (HTTP 200)"
echo ""
