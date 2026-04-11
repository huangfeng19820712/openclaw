#!/usr/bin/env bash
# =============================================================================
# OpenClaw Docker 多实例部署脚本（精简版）
# =============================================================================
# 功能：
#   - 支持多实例隔离部署（通过 INSTANCE_ID）
#   - 支持跳过交互式 onboarding（快速启动 gateway）
#   - 支持跳过镜像构建（多实例复用已构建镜像）
#   - 支持生成新 token（通过 NEW_TOKEN）
#   - 支持自动端口分配（检测到端口偏移）
#   - 移除邀请码相关功能，使用简单的 token 认证
#
# 使用方式：
#   # 多实例部署（手动指定端口偏移）
#   OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_PORT_OFFSET=100 OPENCLAW_NO_ONBOARD=true ./docker-instance-setup.sh
#
#   # 多实例部署（自动分配端口偏移，根据实例 ID 自动计算）
#   OPENCLAW_INSTANCE_ID=gw2 OPENCLAW_NO_ONBOARD=true ./docker-instance-setup.sh
#   # 或
#   ./docker-instance-setup.sh gw2
#
#   # 多实例部署（跳过镜像构建，复用已构建的镜像）
#   OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_NO_ONBOARD=true OPENCLAW_SKIP_BUILD=true \
#     ./docker-instance-setup.sh
#
#   # 重新部署并生成新 token
#   OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_NEW_TOKEN=true ./docker-instance-setup.sh
#
# 环境变量：
#   OPENCLAW_INSTANCE_ID       - 实例标识，默认：default
#   OPENCLAW_INSTANCE_BASE_DIR - 实例基础目录，默认：/data/openclaw/openclaw_instances/
#   OPENCLAW_PORT_OFFSET       - 端口偏移量，默认：自动分配（Gateway 端口 = 18789 + offsni et）
#   OPENCLAW_NO_ONBOARD        - 是否跳过 onboarding，默认：false
#   OPENCLAW_SKIP_BUILD        - 是否跳过镜像构建，默认：false
#   OPENCLAW_NEW_TOKEN         - 是否生成新 token，默认：false
#   OPENCLAW_IMAGE             - Docker 镜像名，默认：openclaw:local
#   OPENCLAW_GATEWAY_BIND      - 网关绑定地址，默认：lan（可选：lan/loopback）
#
# 命令行参数：
#   <instance_id>    - 实例 ID（如 gw1, gw2, gw3）
#   --no-onboard     - 跳过 onboarding
#   --skip-build     - 跳过镜像构建
#   --new-token      - 生成新 token
#   --auto-port      - 强制自动分配端口偏移
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
# 默认值
: "${OPENCLAW_INSTANCE_ID:=}"
: "${OPENCLAW_PORT_OFFSET:=}"
: "${OPENCLAW_NO_ONBOARD:=false}"
: "${OPENCLAW_SKIP_BUILD:=false}"
: "${OPENCLAW_NEW_TOKEN:=false}"
: "${OPENCLAW_GATEWAY_BIND:=lan}"

# 如果命令行第一个参数不是选项，作为实例 ID
if [[ -n "${1:-}" && ! "${1}" =~ ^-- ]]; then
  INSTANCE_ID="$1"
  echo "INFO: Using instance ID from argument: $INSTANCE_ID"
elif [[ -n "$OPENCLAW_INSTANCE_ID" ]]; then
  INSTANCE_ID="$OPENCLAW_INSTANCE_ID"
else
  INSTANCE_ID="default"
fi

PORT_OFFSET="$OPENCLAW_PORT_OFFSET"
NO_ONBOARD="$OPENCLAW_NO_ONBOARD"
SKIP_BUILD="$OPENCLAW_SKIP_BUILD"
NEW_TOKEN="$OPENCLAW_NEW_TOKEN"
GATEWAY_BIND="$OPENCLAW_GATEWAY_BIND"

# 实例目录配置
OPENCLAW_INSTANCE_BASE_DIR="${OPENCLAW_INSTANCE_BASE_DIR:-/data/openclaw/openclaw_instances/}"
OPENCLAW_CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-${OPENCLAW_INSTANCE_BASE_DIR}${INSTANCE_ID}}"
OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${OPENCLAW_INSTANCE_BASE_DIR}${INSTANCE_ID}/workspace/}"

# 支持 --no-onboard 命令行参数
if [[ "${1:-}" == "--no-onboard" ]]; then
  NO_ONBOARD=true
fi

# 当使用命令行参数指定实例 ID 时，自动启用 NO_ONBOARD 模式
if [[ -n "${1:-}" && ! "${1}" =~ ^-- ]]; then
  NO_ONBOARD=true
  echo "INFO: NO_ONBOARD mode enabled for argument-based deployment"
fi

# 支持 --skip-build 命令行参数
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=true
fi

# 支持 --new-token 命令行参数
if [[ "${1:-}" == "--new-token" ]]; then
  NEW_TOKEN=true
fi

# 支持 --auto-port 命令行参数或自动分配端口
# 当未指定 PORT_OFFSET 时，自动检测已用端口并分配下一个可用偏移量
if [[ "${1:-}" == "--auto-port" ]] || [[ -z "$PORT_OFFSET" ]]; then
  # 自动检测已用端口并分配
  detect_port_offset() {
    local -a used_offsets=()
    local max_offset=0

    # 1. 从运行中的 docker 容器检测已用端口
    local projects
    projects=$(docker ps --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | grep "^openclaw-" || true)
    for project in $projects; do
      # 获取容器的端口映射
      local container_id
      container_id=$(docker ps -q --filter "label=com.docker.compose.project=$project" | head -1)
      if [[ -n "$container_id" ]]; then
        local ports
        ports=$(docker port "$container_id" 2>/dev/null || true)
        if [[ -n "$ports" ]]; then
          # 从端口映射中提取 host port (容器端口 18789 映射到宿主机端口)
          # docker port 输出格式：18789/tcp -> 0.0.0.0:18889
          local host_port
          host_port=$(echo "$ports" | grep "18789/tcp" | awk -F'[: >]' '{print $NF}' | head -1)
          if [[ -n "$host_port" && "$host_port" -ge 18789 ]]; then
            local offset=$((host_port - 18789))
            used_offsets+=("$offset")
            if [[ "$offset" -gt "$max_offset" ]]; then
              max_offset="$offset"
            fi
          fi
        fi
      fi
    done

    # 2. 从配置目录检测已用实例
    if [[ -d "$OPENCLAW_INSTANCE_BASE_DIR" ]]; then
      for dir in "$OPENCLAW_INSTANCE_BASE_DIR"*/; do
        if [[ -d "$dir" ]]; then
          local instance_dir
          instance_dir="$(basename "$dir")"
          # 跳过当前实例
          if [[ "$instance_dir" == "$INSTANCE_ID" ]]; then
            continue
          fi
          local env_file="$dir/.env"
          if [[ -f "$env_file" ]]; then
            local port
            port=$(grep "^OPENCLAW_GATEWAY_PORT=" "$env_file" 2>/dev/null | cut -d'=' -f2-)
            if [[ -n "$port" && "$port" -ge 18789 ]]; then
              local offset=$((port - 18789))
              used_offsets+=("$offset")
              if [[ "$offset" -gt "$max_offset" ]]; then
                max_offset="$offset"
              fi
            fi
          fi
        fi
      done
    fi

    # 找到第一个未使用的偏移量（步长 100）
    local next_offset=0
    while true; do
      local is_used=false
      for used in "${used_offsets[@]}"; do
        if [[ "$used" -eq "$next_offset" ]]; then
          is_used=true
          break
        fi
      done
      if [[ "$is_used" == "false" ]]; then
        break
      fi
      next_offset=$((next_offset + 100))
    done

    echo "$next_offset"
  }

  if [[ -z "$PORT_OFFSET" ]]; then
    PORT_OFFSET="$(detect_port_offset)"
    echo "INFO: Auto-detected port offset: $PORT_OFFSET (Gateway port: $((18789 + PORT_OFFSET)))"
  fi
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

# 修复配置目录权限，允许容器内 node 用户 (uid 1000) 写入
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$OPENCLAW_CONFIG_DIR:/config" --user root alpine sh -c \
    "find /config -xdev -exec chown 1000:1000 {} + 2>/dev/null || true"
fi

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

export COMPOSE_PROJECT_NAME="openclaw-$(echo "${INSTANCE_ID}" | tr '[:upper:]' '[:lower:]')"
# 确保 PORT_OFFSET 有默认值
PORT_OFFSET="${PORT_OFFSET:-0}"
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

# 如果需要生成新 token，或者没有现有 token
if [[ "$NEW_TOKEN" == "true" && -z "$EXISTING_CONFIG_TOKEN" ]]; then
  # 第一次部署，生成新 token
  if command -v openssl >/dev/null 2>&1; then
    OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
  elif command -v python3 >/dev/null 2>&1; then
    OPENCLAW_GATEWAY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  else
    OPENCLAW_GATEWAY_TOKEN="$(head -c 32 /dev/urandom | xxd -p)"
  fi
  echo "Generated new gateway token"
elif [[ "$NEW_TOKEN" == "true" && -n "$EXISTING_CONFIG_TOKEN" ]]; then
  # 重新部署，强制生成新 token
  if command -v openssl >/dev/null 2>&1; then
    OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
  elif command -v python3 >/dev/null 2>&1; then
    OPENCLAW_GATEWAY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  else
    OPENCLAW_GATEWAY_TOKEN="$(head -c 32 /dev/urandom | xxd -p)"
  fi
  echo "Generated new gateway token (NEW_TOKEN=true)"
elif [[ -n "$EXISTING_CONFIG_TOKEN" ]]; then
  # 有现有 token，复用
  OPENCLAW_GATEWAY_TOKEN="$EXISTING_CONFIG_TOKEN"
  echo "Reusing gateway token from config"
else
  # 尝试从 .env 文件读取
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
    // Remove invalid plugin paths
    if (config.plugins && config.plugins.load && config.plugins.load.paths) {
      config.plugins.load.paths = config.plugins.load.paths.filter(p => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      });
      if (config.plugins.load.paths.length === 0) {
        delete config.plugins.load.paths;
      }
    }
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
    node dist/index.js config set gateway.mode local >/dev/null
  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-gateway \
    node dist/index.js config set gateway.bind "$OPENCLAW_GATEWAY_BIND" >/dev/null
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
    node dist/index.js config set gateway.controlUi.allowedOrigins "$allowed_origin_json" >/dev/null
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

# 获取宿主机 IP 地址
HOST_IP=""
if command -v hostname >/dev/null 2>&1; then
  HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || hostname 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1 || echo "")"
fi

echo "Control UI 访问 URL:"
echo "  本地访问：http://127.0.0.1:$OPENCLAW_GATEWAY_PORT/?session=main"
if [[ -n "$HOST_IP" && "$HOST_IP" != "127.0.0.1" && "$HOST_IP" != "localhost" ]]; then
  echo "  局域网访问：http://$HOST_IP:$OPENCLAW_GATEWAY_PORT/?session=main"
fi
echo ""
echo "或使用带 token 的 URL:"
echo "  本地访问：http://127.0.0.1:$OPENCLAW_GATEWAY_PORT/?token=$OPENCLAW_GATEWAY_TOKEN&session=main"
if [[ -n "$HOST_IP" && "$HOST_IP" != "127.0.0.1" && "$HOST_IP" != "localhost" ]]; then
  echo "  局域网访问：http://$HOST_IP:$OPENCLAW_GATEWAY_PORT/?token=$OPENCLAW_GATEWAY_TOKEN&session=main"
fi
echo ""
echo "管理命令:"
echo "  查看日志：docker compose ${COMPOSE_ARGS[*]/#/-} logs -f openclaw-gateway"
echo "  停止实例：docker compose ${COMPOSE_ARGS[*]/#/-} down"
echo "  健康检查：docker exec openclaw-${INSTANCE_ID}-openclaw-gateway-1 node dist/index.js health"
echo ""
