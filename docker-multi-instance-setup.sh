#!/usr/bin/env bash
# =============================================================================
# OpenClaw Docker 多实例部署脚本（精简版）
# =============================================================================
# 功能：
#   - 支持多实例隔离部署（通过 INSTANCE_ID）
#   - 支持跳过交互式 onboarding（快速启动 gateway）
#   - 支持跳过镜像构建（多实例复用已构建镜像）
#   - 移除邀请码相关功能，使用简单的 token 认证
#
# 使用方式：
#   # 多实例部署（只需指定实例名）
#   OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_NO_ONBOARD=true ./docker-multi-instance-setup.sh
#
#   # 多实例部署（跳过镜像构建，复用已构建的镜像）
#   OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_NO_ONBOARD=true OPENCLAW_SKIP_BUILD=true \
#     ./docker-multi-instance-setup.sh
#
# 环境变量：
#   OPENCLAW_INSTANCE_ID       - 实例标识，默认：default
#   OPENCLAW_INSTANCE_BASE_DIR - 实例基础目录，默认：/data/openclaw/openclaw_instances/
#   OPENCLAW_PORT_OFFSET       - 端口偏移量，默认：0（Gateway 端口 = 18789 + offset）
#   OPENCLAW_NO_ONBOARD        - 是否跳过 onboarding，默认：false
#   OPENCLAW_SKIP_BUILD        - 是否跳过镜像构建，默认：false
#   OPENCLAW_IMAGE             - Docker 镜像名，默认：openclaw:local
#   OPENCLAW_GATEWAY_BIND      - 网关绑定地址，默认：lan（可选：lan/loopback）
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# 基础配置
# -----------------------------------------------------------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
EXTRA_COMPOSE_FILE="$ROOT_DIR/docker-compose.extra.yml"
IMAGE_NAME="${OPENCLAW_IMAGE:-openclaw:local}"

# -----------------------------------------------------------------------------
# 多实例支持配置
# -----------------------------------------------------------------------------
INSTANCE_ID="${OPENCLAW_INSTANCE_ID:-default}"
PORT_OFFSET="${OPENCLAW_PORT_OFFSET:-0}"
NO_ONBOARD="${OPENCLAW_NO_ONBOARD:-false}"
SKIP_BUILD="${OPENCLAW_SKIP_BUILD:-false}"
GATEWAY_BIND="${OPENCLAW_GATEWAY_BIND:-lan}"

# 实例目录配置
OPENCLAW_INSTANCE_BASE_DIR="${OPENCLAW_INSTANCE_BASE_DIR:-/data/openclaw/openclaw_instances/}"
OPENCLAW_CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-${OPENCLAW_INSTANCE_BASE_DIR}${INSTANCE_ID}}"
OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${OPENCLAW_INSTANCE_BASE_DIR}${INSTANCE_ID}/workspace/}"

# 支持 --no-onboard 命令行参数
if [[ "${1:-}" == "--no-onboard" ]]; then
  NO_ONBOARD=true
fi

# 支持 --skip-build 命令行参数
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=true
fi

# =============================================================================
# 辅助函数
# =============================================================================

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

is_truthy_value() {
  local raw="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    1 | true | yes | on) return 0 ;;
    *) return 1 ;;
  esac
}

# 从配置文件中读取 gateway token
read_config_gateway_token() {
  local config_path="$OPENCLAW_CONFIG_DIR/openclaw.json"
  if [[ ! -f "$config_path" ]]; then
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$config_path" <<'PY'
import json
import sys
path = sys.argv[1]
try:
    with open(path) as f:
        cfg = json.load(f)
except Exception:
    raise SystemExit(0)
gateway = cfg.get("gateway")
if not isinstance(gateway, dict):
    raise SystemExit(0)
auth = gateway.get("auth")
if not isinstance(auth, dict):
    raise SystemExit(0)
token = auth.get("token")
if isinstance(token, str):
    token = token.strip()
    if token:
        print(token)
PY
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node - "$config_path" <<'NODE'
const fs = require("node:fs");
const configPath = process.argv[2];
try {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const token = cfg?.gateway?.auth?.token;
  if (typeof token === "string" && token.trim().length > 0) {
    process.stdout.write(token.trim());
  }
} catch {}
NODE
  fi
}

# 从 .env 文件中读取 gateway token
read_env_gateway_token() {
  local env_path="$1"
  if [[ ! -f "$env_path" ]]; then
    return 0
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" == OPENCLAW_GATEWAY_TOKEN=* ]]; then
      printf '%s' "${line#OPENCLAW_GATEWAY_TOKEN=}"
      return 0
    fi
  done <"$env_path"
}

# =============================================================================
# 依赖检查和环境初始化
# =============================================================================

require_cmd docker
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose not available" >&2
  exit 1
fi

# =============================================================================
# 配置目录初始化
# =============================================================================

mkdir -p "$OPENCLAW_CONFIG_DIR"
mkdir -p "$OPENCLAW_WORKSPACE_DIR"
mkdir -p "$OPENCLAW_CONFIG_DIR/identity"
mkdir -p "$OPENCLAW_CONFIG_DIR/agents/main/agent"
mkdir -p "$OPENCLAW_CONFIG_DIR/agents/main/sessions"

# 创建 .bashrc 文件
bashrc_file="$OPENCLAW_CONFIG_DIR/.bashrc"
if [[ ! -f "$bashrc_file" ]]; then
  cat > "$bashrc_file" << 'BASHRC'
# OpenClaw CLI alias
alias openclaw='node /app/dist/index.js'
if [[ -f /etc/bash.bashrc ]]; then
  source /etc/bash.bashrc
fi
BASHRC
fi

# =============================================================================
# 端口和项目配置
# =============================================================================

export COMPOSE_PROJECT_NAME="openclaw-${INSTANCE_ID}"
export OPENCLAW_GATEWAY_PORT="$((18789 + PORT_OFFSET))"
export OPENCLAW_BRIDGE_PORT="$((18790 + PORT_OFFSET))"
export OPENCLAW_GATEWAY_BIND="$GATEWAY_BIND"
export OPENCLAW_CONFIG_DIR
export OPENCLAW_WORKSPACE_DIR
export OPENCLAW_IMAGE="$IMAGE_NAME"

# =============================================================================
# Gateway Token 处理
# =============================================================================

# 检查是否已有 token
EXISTING_CONFIG_TOKEN="$(read_config_gateway_token || true)"
if [[ -n "$EXISTING_CONFIG_TOKEN" ]]; then
  OPENCLAW_GATEWAY_TOKEN="$EXISTING_CONFIG_TOKEN"
  echo "Reusing gateway token from config"
else
  DOTENV_GATEWAY_TOKEN="$(read_env_gateway_token "$ROOT_DIR/.env" || true)"
  if [[ -n "$DOTENV_GATEWAY_TOKEN" ]]; then
    OPENCLAW_GATEWAY_TOKEN="$DOTENV_GATEWAY_TOKEN"
    echo "Reusing gateway token from .env"
  else
    # 生成新 token
    if command -v openssl >/dev/null 2>&1; then
      OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
    elif command -v python3 >/dev/null 2>&1; then
      OPENCLAW_GATEWAY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
    else
      OPENCLAW_GATEWAY_TOKEN="$(head -c 32 /dev/urandom | xxd -p)"
    fi
    echo "Generated new gateway token"
  fi
fi
export OPENCLAW_GATEWAY_TOKEN

# =============================================================================
# Docker Compose 配置
# =============================================================================

COMPOSE_FILES=("$COMPOSE_FILE")
COMPOSE_ARGS=()

# 创建 extra compose 文件（多实例挂载配置）
write_extra_compose() {
  cat >"$EXTRA_COMPOSE_FILE" <<YAML
services:
  openclaw-gateway:
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace
YAML
}

write_extra_compose
COMPOSE_FILES+=("$EXTRA_COMPOSE_FILE")

for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_ARGS+=("-f" "$compose_file")
done

ENV_FILE="$ROOT_DIR/.env"

# 更新 .env 文件
upsert_env() {
  local file="$1"
  shift
  local -a keys=("$@")
  local tmp; tmp="$(mktemp)"
  local seen=" "

  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      local key="${line%%=*}"
      local replaced=false
      for k in "${keys[@]}"; do
        if [[ "$key" == "$k" ]]; then
          printf '%s=%s\n' "$k" "${!k-}" >>"$tmp"
          seen="$seen$k "
          replaced=true
          break
        fi
      done
      if [[ "$replaced" == false ]]; then
        printf '%s\n' "$line" >>"$tmp"
      fi
    done <"$file"
  fi

  for k in "${keys[@]}"; do
    if [[ "$seen" != *" $k "* ]]; then
      printf '%s=%s\n' "$k" "${!k-}" >>"$tmp"
    fi
  done

  mv "$tmp" "$file"
}

upsert_env "$ENV_FILE" \
  OPENCLAW_CONFIG_DIR \
  OPENCLAW_WORKSPACE_DIR \
  OPENCLAW_GATEWAY_PORT \
  OPENCLAW_BRIDGE_PORT \
  OPENCLAW_GATEWAY_BIND \
  OPENCLAW_GATEWAY_TOKEN \
  OPENCLAW_IMAGE

# =============================================================================
# 镜像构建
# =============================================================================

if [[ "$SKIP_BUILD" == "true" ]]; then
  echo "==> Skipping image build (SKIP_BUILD=true)"
  if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "ERROR: Image '$IMAGE_NAME' not found. Run without --skip-build first." >&2
    exit 1
  fi
elif docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "==> Image already exists: $IMAGE_NAME"
  echo "    Skipping build (reuse existing image)"
else
  echo "==> Building Docker image: $IMAGE_NAME"
  docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"
fi

# =============================================================================
# 权限修复
# =============================================================================

echo ""
echo "==> Fixing data-directory permissions"
docker compose "${COMPOSE_ARGS[@]}" run --rm --user root --entrypoint sh openclaw-gateway -c \
  'find /home/node/.openclaw -xdev -exec chown node:node {} +; \
   [ -d /home/node/.openclaw/workspace/.openclaw ] && chown -R node:node /home/node/.openclaw/workspace/.openclaw || true'

# =============================================================================
# 配置初始化 (NO_ONBOARD 模式)
# =============================================================================

if [[ "$NO_ONBOARD" == "true" ]]; then
  echo ""
  echo "==> Skipping onboarding (NO_ONBOARD=true)"
  echo "Gateway token: ${OPENCLAW_GATEWAY_TOKEN}"

  # 设置 gateway token 到配置
  echo "==> Setting gateway token and auth mode to config..."
  config_file="$OPENCLAW_CONFIG_DIR/openclaw.json"

  # 确保配置文件存在
  if [[ ! -f "$config_file" ]]; then
    echo '{}' > "$config_file"
    chown 1000:1000 "$config_file"
  fi

  # 使用 node 修改配置
  docker compose "${COMPOSE_ARGS[@]}" run --rm --entrypoint node openclaw-gateway -e "
    const fs = require('fs');
    const configPath = '/home/node/.openclaw/openclaw.json';
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      config = {};
    }
    config.gateway = config.gateway || {};
    config.gateway.auth = config.gateway.auth || {};
    config.gateway.auth.token = \"$OPENCLAW_GATEWAY_TOKEN\";
    config.gateway.auth.mode = 'token';
    config.gateway.bind = '$OPENCLAW_GATEWAY_BIND';
    // Allow Control UI without device identity
    if (!config.gateway.controlUi) config.gateway.controlUi = {};
    config.gateway.controlUi.dangerouslyDisableDeviceAuth = true;
    config.gateway.controlUi.allowInsecureAuth = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.log('Config updated successfully');
  "

  # 写入 .env 文件持久化
  if [[ -f "$ENV_FILE" ]]; then
    if grep -q "^OPENCLAW_GATEWAY_TOKEN=" "$ENV_FILE" 2>/dev/null; then
      sed -i.bak "s/^OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN/" "$ENV_FILE" 2>/dev/null || {
        local tmp_file; tmp_file="$(mktemp)"
        sed "s/^OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN/" "$ENV_FILE" > "$tmp_file"
        mv "$tmp_file" "$ENV_FILE"
      }
      rm -f "${ENV_FILE}.bak" 2>/dev/null || true
    else
      echo "OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN" >> "$ENV_FILE"
    fi
  else
    echo "OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN" > "$ENV_FILE"
  fi

  # 同步 gateway 配置
  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-gateway \
    config set gateway.mode local >/dev/null
  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-gateway \
    config set gateway.bind "$OPENCLAW_GATEWAY_BIND" >/dev/null
  echo "Pinned gateway.mode=local and gateway.bind=$OPENCLAW_GATEWAY_BIND"
fi

# =============================================================================
# 配置 Control UI 允许的源
# =============================================================================

ensure_control_ui_allowed_origins() {
  if [[ "$OPENCLAW_GATEWAY_BIND" == "loopback" ]]; then
    return 0
  fi

  local host_ip=""
  if command -v hostname >/dev/null 2>&1; then
    host_ip="$(hostname -I | awk '{print $1}' 2>/dev/null || hostname 2>/dev/null || echo "")"
  fi

  local allowed_origins=()
  allowed_origins+=("http://localhost:$OPENCLAW_GATEWAY_PORT")
  allowed_origins+=("http://127.0.0.1:$OPENCLAW_GATEWAY_PORT")
  if [[ -n "$host_ip" && "$host_ip" != "127.0.0.1" && "$host_ip" != "localhost" ]]; then
    allowed_origins+=("http://$host_ip:$OPENCLAW_GATEWAY_PORT")
  fi

  local origins_str=""
  for i in "${!allowed_origins[@]}"; do
    if [[ $i -eq 0 ]]; then
      origins_str="\"${allowed_origins[$i]}\""
    else
      origins_str="$origins_str,\"${allowed_origins[$i]}\""
    fi
  done
  local allowed_origin_json="[$origins_str]"

  local current_allowed_origins
  current_allowed_origins="$(
    docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-gateway \
      config get gateway.controlUi.allowedOrigins 2>/dev/null || true
  )"
  current_allowed_origins="${current_allowed_origins//$'\r'/}"

  local expected_origin="http://localhost:$OPENCLAW_GATEWAY_PORT"
  if [[ -n "$current_allowed_origins" && "$current_allowed_origins" != "null" && "$current_allowed_origins" != "[]" ]]; then
    if [[ "$current_allowed_origins" == *"$expected_origin"* ]]; then
      echo "Control UI allowlist already configured"
      return 0
    fi
    echo "Updating Control UI allowlist from $current_allowed_origins to $allowed_origin_json"
  fi

  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-gateway \
    config set gateway.controlUi.allowedOrigins "$allowed_origin_json" >/dev/null
  echo "Set gateway.controlUi.allowedOrigins"
}

echo ""
echo "==> Control UI origin allowlist"
ensure_control_ui_allowed_origins

# =============================================================================
# 启动网关
# =============================================================================

echo ""
echo "==> Starting gateway"
docker compose "${COMPOSE_ARGS[@]}" up -d openclaw-gateway

# 等待网关启动
sleep 3

# =============================================================================
# 输出完成信息
# =============================================================================

echo ""
echo "=============================================="
echo "  OpenClaw 多实例部署完成"
echo "=============================================="
echo ""
echo "实例信息:"
echo "  实例 ID:      $INSTANCE_ID"
echo "  配置目录：    $OPENCLAW_CONFIG_DIR"
echo "  工作空间：    $OPENCLAW_WORKSPACE_DIR"
echo "  Gateway 端口：$OPENCLAW_GATEWAY_PORT"
echo "  Bridge 端口：$OPENCLAW_BRIDGE_PORT"
echo ""
echo "访问信息:"
echo "  Gateway Token: $OPENCLAW_GATEWAY_TOKEN"
echo ""
echo "Control UI 访问 URL:"
echo "  http://127.0.0.1:$OPENCLAW_GATEWAY_PORT/control-ui/?session=main"
echo ""
echo "或使用带 token 的 URL:"
echo "  http://127.0.0.1:$OPENCLAW_GATEWAY_PORT/control-ui/?token=$OPENCLAW_GATEWAY_TOKEN&session=main"
echo ""
echo "管理命令:"
echo "  查看日志：docker compose ${COMPOSE_ARGS[*]/#/-} logs -f openclaw-gateway"
echo "  停止实例：docker compose ${COMPOSE_ARGS[*]/#/-} down"
echo "  健康检查：docker exec openclaw-${INSTANCE_ID}-openclaw-gateway-1 node dist/index.js health"
echo ""
