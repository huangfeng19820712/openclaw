#!/usr/bin/env bash
# =============================================================================
# OpenClaw Docker 部署脚本
# =============================================================================
# 功能：
#   - 支持单实例快速部署
#   - 支持多实例隔离部署（通过 INSTANCE_ID 和 PORT_OFFSET）
#   - 支持跳过交互式 onboarding（快速启动 gateway）
#   - 支持跳过镜像构建（多实例复用已构建镜像）
#   - 支持 Sandbox 沙箱模式
#
# 使用方式：
#   # 快速启动（无交互）
#   OPENCLAW_NO_ONBOARD=true ./docker-setup.sh
#   ./docker-setup.sh --no-onboard
#
#   # 多实例部署
#   OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_PORT_OFFSET=100 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh
#
#   # 多实例部署（跳过镜像构建，复用已构建的镜像）
#   OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_PORT_OFFSET=100 OPENCLAW_NO_ONBOARD=true OPENCLAW_SKIP_BUILD=true ./docker-setup.sh
#   ./docker-setup.sh --skip-build
#
# 环境变量：
#   OPENCLAW_INSTANCE_ID   - 实例标识，默认：default
#   OPENCLAW_PORT_OFFSET   - 端口偏移量，默认：0（Gateway 端口 = 18789 + offset）
#   OPENCLAW_NO_ONBOARD    - 是否跳过 onboarding，默认：false
#   OPENCLAW_SKIP_BUILD    - 是否跳过镜像构建，默认：false
#   OPENCLAW_IMAGE         - Docker 镜像名，默认：openclaw:local
#   OPENCLAW_EXTRA_MOUNTS  - 额外挂载点，逗号分隔
#   OPENCLAW_HOME_VOLUME   - 命名卷名称
#   OPENCLAW_SANDBOX       - 是否启用沙箱，默认：false
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# 基础配置
# -----------------------------------------------------------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
EXTRA_COMPOSE_FILE="$ROOT_DIR/docker-compose.extra.yml"
IMAGE_NAME="${OPENCLAW_IMAGE:-openclaw:local}"
EXTRA_MOUNTS="${OPENCLAW_EXTRA_MOUNTS:-}"
HOME_VOLUME_NAME="${OPENCLAW_HOME_VOLUME:-}"
RAW_SANDBOX_SETTING="${OPENCLAW_SANDBOX:-}"
SANDBOX_ENABLED=""
DOCKER_SOCKET_PATH="${OPENCLAW_DOCKER_SOCKET:-}"

# -----------------------------------------------------------------------------
# 多实例支持配置
# -----------------------------------------------------------------------------
# INSTANCE_ID: 实例唯一标识，用于隔离配置目录
INSTANCE_ID="${OPENCLAW_INSTANCE_ID:-default}"
# PORT_OFFSET: 端口偏移量，用于多实例端口分配
#   Gateway 端口 = 18789 + PORT_OFFSET
#   Bridge 端口 = 18790 + PORT_OFFSET
PORT_OFFSET="${OPENCLAW_PORT_OFFSET:-0}"
# NO_ONBOARD: 是否跳过交互式 onboarding 配置
NO_ONBOARD="${OPENCLAW_NO_ONBOARD:-false}"
# SKIP_BUILD: 是否跳过镜像构建（多实例复用时使用）
SKIP_BUILD="${OPENCLAW_SKIP_BUILD:-false}"

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

# 输出错误信息并退出
# 参数：错误消息内容
fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# 检查命令是否存在
# 参数：命令名称
require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

# 检查值是否为真（1/true/yes/on）
# 参数：待检查的值
is_truthy_value() {
  local raw="${1:-}"
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    1 | true | yes | on) return 0 ;;
    *) return 1 ;;
  esac
}

# 从配置文件中读取 gateway token
# 支持 Python3 和 Node.js 两种解析方式
# 返回：token 字符串（如果存在）
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
    with open(path, "r", encoding="utf-8") as f:
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
} catch {
  // Keep docker-setup resilient when config parsing fails.
}
NODE
  fi
}

# 从 .env 文件中读取 gateway token
# 参数：env_path - .env 文件路径
# 返回：token 字符串（如果存在）
read_env_gateway_token() {
  local env_path="$1"
  local line=""
  local token=""
  if [[ ! -f "$env_path" ]]; then
    return 0
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" == OPENCLAW_GATEWAY_TOKEN=* ]]; then
      token="${line#OPENCLAW_GATEWAY_TOKEN=}"
    fi
  done <"$env_path"
  if [[ -n "$token" ]]; then
    printf '%s' "$token"
  fi
}

# 配置 Control UI 允许的源（非 loopback 绑定需要）
ensure_control_ui_allowed_origins() {
  if [[ "${OPENCLAW_GATEWAY_BIND}" == "loopback" ]]; then
    return 0
  fi

  local allowed_origin_json
  local current_allowed_origins
  allowed_origin_json="$(printf '["http://127.0.0.1:%s"]' "$OPENCLAW_GATEWAY_PORT")"
  current_allowed_origins="$(
    docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-cli \
      config get gateway.controlUi.allowedOrigins 2>/dev/null || true
  )"
  current_allowed_origins="${current_allowed_origins//$'\r'/}"

  if [[ -n "$current_allowed_origins" && "$current_allowed_origins" != "null" && "$current_allowed_origins" != "[]" ]]; then
    echo "Control UI allowlist already configured; leaving gateway.controlUi.allowedOrigins unchanged."
    return 0
  fi

  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-cli \
    config set gateway.controlUi.allowedOrigins "$allowed_origin_json" --strict-json >/dev/null
  echo "Set gateway.controlUi.allowedOrigins to $allowed_origin_json for non-loopback bind."
}

# 同步 gateway 配置：设置 mode=local 和 bind 参数
sync_gateway_mode_and_bind() {
  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-cli \
    config set gateway.mode local >/dev/null
  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-cli \
    config set gateway.bind "$OPENCLAW_GATEWAY_BIND" >/dev/null
  echo "Pinned gateway.mode=local and gateway.bind=$OPENCLAW_GATEWAY_BIND for Docker setup."
}

# 检查字符串是否包含非法字符（换行、回车、制表符）
contains_disallowed_chars() {
  local value="$1"
  [[ "$value" == *$'\n'* || "$value" == *$'\r'* || "$value" == *$'\t'* ]]
}

# 验证挂载路径值
validate_mount_path_value() {
  local label="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    fail "$label cannot be empty."
  fi
  if contains_disallowed_chars "$value"; then
    fail "$label contains unsupported control characters."
  fi
  if [[ "$value" =~ [[:space:]] ]]; then
    fail "$label cannot contain whitespace."
  fi
}

# 验证命名卷名称
validate_named_volume() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
    fail "OPENCLAW_HOME_VOLUME must match [A-Za-z0-9][A-Za-z0-9_.-]* when using a named volume."
  fi
}

# 验证挂载规格
validate_mount_spec() {
  local mount="$1"
  if contains_disallowed_chars "$mount"; then
    fail "OPENCLAW_EXTRA_MOUNTS entries cannot contain control characters."
  fi
  # Keep mount specs strict to avoid YAML structure injection.
  # Expected format: source:target[:options]
  if [[ ! "$mount" =~ ^[^[:space:],:]+:[^[:space:],:]+(:[^[:space:],:]+)?$ ]]; then
    fail "Invalid mount format '$mount'. Expected source:target[:options] without spaces."
  fi
}

# =============================================================================
# 依赖检查和环境初始化
# =============================================================================

# 检查 Docker 依赖
require_cmd docker
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose not available (try: docker compose version)" >&2
  exit 1
fi

# Docker Socket 路径检测
if [[ -z "$DOCKER_SOCKET_PATH" && "${DOCKER_HOST:-}" == unix://* ]]; then
  DOCKER_SOCKET_PATH="${DOCKER_HOST#unix://}"
fi
if [[ -z "$DOCKER_SOCKET_PATH" ]]; then
  DOCKER_SOCKET_PATH="/var/run/docker.sock"
fi

# 解析 Sandbox 设置
if is_truthy_value "$RAW_SANDBOX_SETTING"; then
  SANDBOX_ENABLED="1"
fi

# -----------------------------------------------------------------------------
# 配置目录和环境变量（支持多实例隔离）
# -----------------------------------------------------------------------------
# 配置目录：~/.openclaw-${INSTANCE_ID}，每个实例独立配置
OPENCLAW_CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-$HOME/.openclaw-${INSTANCE_ID}}"
# 工作空间目录：~/.openclaw-${INSTANCE_ID}/workspace
OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-$HOME/.openclaw-${INSTANCE_ID}/workspace}"

# 验证目录路径
validate_mount_path_value "OPENCLAW_CONFIG_DIR" "$OPENCLAW_CONFIG_DIR"
validate_mount_path_value "OPENCLAW_WORKSPACE_DIR" "$OPENCLAW_WORKSPACE_DIR"
if [[ -n "$HOME_VOLUME_NAME" ]]; then
  if [[ "$HOME_VOLUME_NAME" == *"/"* ]]; then
    validate_mount_path_value "OPENCLAW_HOME_VOLUME" "$HOME_VOLUME_NAME"
  else
    validate_named_volume "$HOME_VOLUME_NAME"
  fi
fi
if contains_disallowed_chars "$EXTRA_MOUNTS"; then
  fail "OPENCLAW_EXTRA_MOUNTS cannot contain control characters."
fi
if [[ -n "$SANDBOX_ENABLED" ]]; then
  validate_mount_path_value "OPENCLAW_DOCKER_SOCKET" "$DOCKER_SOCKET_PATH"
fi

# 创建必要的目录
mkdir -p "$OPENCLAW_CONFIG_DIR"
mkdir -p "$OPENCLAW_WORKSPACE_DIR"
# Seed directory tree eagerly so bind mounts work even on Docker Desktop/Windows
# where the container (even as root) cannot create new host subdirectories.
mkdir -p "$OPENCLAW_CONFIG_DIR/identity"
mkdir -p "$OPENCLAW_CONFIG_DIR/agents/main/agent"
mkdir -p "$OPENCLAW_CONFIG_DIR/agents/main/sessions"

# 创建 .bashrc 文件（用于 CLI alias）
bashrc_file="$OPENCLAW_CONFIG_DIR/.bashrc"
if [[ ! -f "$bashrc_file" ]]; then
  echo "==> Creating .bashrc with openclaw CLI alias"
  cat > "$bashrc_file" << 'BASHRC'
# OpenClaw CLI alias
alias openclaw='node /app/dist/index.js'

# Load default bashrc if exists
if [[ -f /etc/bash.bashrc ]]; then
  source /etc/bash.bashrc
fi
BASHRC
fi

# 导出环境变量
export OPENCLAW_CONFIG_DIR
export OPENCLAW_WORKSPACE_DIR
# 多实例部署：使用 INSTANCE_ID 作为项目名，避免容器名冲突
export COMPOSE_PROJECT_NAME="openclaw-${INSTANCE_ID}"
# 端口计算：基础端口 + 偏移量（强制重新计算，不使用已设置的值）
export OPENCLAW_GATEWAY_PORT="$((18789 + PORT_OFFSET))"
export OPENCLAW_BRIDGE_PORT="$((18790 + PORT_OFFSET))"
export OPENCLAW_GATEWAY_BIND="${OPENCLAW_GATEWAY_BIND:-lan}"
export OPENCLAW_IMAGE="$IMAGE_NAME"
export OPENCLAW_DOCKER_APT_PACKAGES="${OPENCLAW_DOCKER_APT_PACKAGES:-}"
export OPENCLAW_EXTENSIONS="${OPENCLAW_EXTENSIONS:-}"
export OPENCLAW_EXTRA_MOUNTS="$EXTRA_MOUNTS"
export OPENCLAW_HOME_VOLUME="$HOME_VOLUME_NAME"
export OPENCLAW_ALLOW_INSECURE_PRIVATE_WS="${OPENCLAW_ALLOW_INSECURE_PRIVATE_WS:-}"
export OPENCLAW_SANDBOX="$SANDBOX_ENABLED"
export OPENCLAW_DOCKER_SOCKET="$DOCKER_SOCKET_PATH"

# 检测 Docker socket GID（用于 sandbox group_add）
DOCKER_GID=""
if [[ -n "$SANDBOX_ENABLED" && -S "$DOCKER_SOCKET_PATH" ]]; then
  DOCKER_GID="$(stat -c '%g' "$DOCKER_SOCKET_PATH" 2>/dev/null || stat -f '%g' "$DOCKER_SOCKET_PATH" 2>/dev/null || echo "")"
fi
export DOCKER_GID

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  EXISTING_CONFIG_TOKEN="$(read_config_gateway_token || true)"
  if [[ -n "$EXISTING_CONFIG_TOKEN" ]]; then
    OPENCLAW_GATEWAY_TOKEN="$EXISTING_CONFIG_TOKEN"
    echo "Reusing gateway token from $OPENCLAW_CONFIG_DIR/openclaw.json"
  else
    DOTENV_GATEWAY_TOKEN="$(read_env_gateway_token "$ROOT_DIR/.env" || true)"
    if [[ -n "$DOTENV_GATEWAY_TOKEN" ]]; then
      OPENCLAW_GATEWAY_TOKEN="$DOTENV_GATEWAY_TOKEN"
      echo "Reusing gateway token from $ROOT_DIR/.env"
    elif command -v openssl >/dev/null 2>&1; then
      OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
    else
      OPENCLAW_GATEWAY_TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"
    fi
  fi
fi
export OPENCLAW_GATEWAY_TOKEN

COMPOSE_FILES=("$COMPOSE_FILE")
COMPOSE_ARGS=()

write_extra_compose() {
  local home_volume="$1"
  shift
  local mount
  local gateway_home_mount
  local gateway_config_mount
  local gateway_workspace_mount

  cat >"$EXTRA_COMPOSE_FILE" <<'YAML'
services:
  openclaw-gateway:
    volumes:
YAML

  if [[ -n "$home_volume" ]]; then
    gateway_home_mount="${home_volume}:/home/node"
    gateway_config_mount="${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw"
    gateway_workspace_mount="${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace"
    validate_mount_spec "$gateway_home_mount"
    validate_mount_spec "$gateway_config_mount"
    validate_mount_spec "$gateway_workspace_mount"
    printf '      - %s\n' "$gateway_home_mount" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$gateway_config_mount" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$gateway_workspace_mount" >>"$EXTRA_COMPOSE_FILE"
  fi

  for mount in "$@"; do
    validate_mount_spec "$mount"
    printf '      - %s\n' "$mount" >>"$EXTRA_COMPOSE_FILE"
  done

  cat >>"$EXTRA_COMPOSE_FILE" <<'YAML'
  openclaw-cli:
    volumes:
YAML

  if [[ -n "$home_volume" ]]; then
    printf '      - %s\n' "$gateway_home_mount" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$gateway_config_mount" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$gateway_workspace_mount" >>"$EXTRA_COMPOSE_FILE"
  fi

  for mount in "$@"; do
    validate_mount_spec "$mount"
    printf '      - %s\n' "$mount" >>"$EXTRA_COMPOSE_FILE"
  done

  if [[ -n "$home_volume" && "$home_volume" != *"/"* ]]; then
    validate_named_volume "$home_volume"
    cat >>"$EXTRA_COMPOSE_FILE" <<YAML
volumes:
  ${home_volume}:
YAML
  fi
}

# When sandbox is requested, ensure Docker CLI build arg is set for local builds.
# Docker socket mount is deferred until sandbox prerequisites are verified.
if [[ -n "$SANDBOX_ENABLED" ]]; then
  if [[ -z "${OPENCLAW_INSTALL_DOCKER_CLI:-}" ]]; then
    export OPENCLAW_INSTALL_DOCKER_CLI=1
  fi
fi

VALID_MOUNTS=()
if [[ -n "$EXTRA_MOUNTS" ]]; then
  IFS=',' read -r -a mounts <<<"$EXTRA_MOUNTS"
  for mount in "${mounts[@]}"; do
    mount="${mount#"${mount%%[![:space:]]*}"}"
    mount="${mount%"${mount##*[![:space:]]}"}"
    if [[ -n "$mount" ]]; then
      VALID_MOUNTS+=("$mount")
    fi
  done
fi

if [[ -n "$HOME_VOLUME_NAME" || ${#VALID_MOUNTS[@]} -gt 0 ]]; then
  # Bash 3.2 + nounset treats "${array[@]}" on an empty array as unbound.
  if [[ ${#VALID_MOUNTS[@]} -gt 0 ]]; then
    write_extra_compose "$HOME_VOLUME_NAME" "${VALID_MOUNTS[@]}"
  else
    write_extra_compose "$HOME_VOLUME_NAME"
  fi
  COMPOSE_FILES+=("$EXTRA_COMPOSE_FILE")
fi
for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_ARGS+=("-f" "$compose_file")
done
# Keep a base compose arg set without sandbox overlay so rollback paths can
# force a known-safe gateway service definition (no docker.sock mount).
BASE_COMPOSE_ARGS=("${COMPOSE_ARGS[@]}")
COMPOSE_HINT="docker compose"
for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_HINT+=" -f ${compose_file}"
done

ENV_FILE="$ROOT_DIR/.env"
upsert_env() {
  local file="$1"
  shift
  local -a keys=("$@")
  local tmp
  tmp="$(mktemp)"
  # Use a delimited string instead of an associative array so the script
  # works with Bash 3.2 (macOS default) which lacks `declare -A`.
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
  OPENCLAW_IMAGE \
  OPENCLAW_EXTRA_MOUNTS \
  OPENCLAW_HOME_VOLUME \
  OPENCLAW_DOCKER_APT_PACKAGES \
  OPENCLAW_EXTENSIONS \
  OPENCLAW_SANDBOX \
  OPENCLAW_DOCKER_SOCKET \
  DOCKER_GID \
  OPENCLAW_INSTALL_DOCKER_CLI \
  OPENCLAW_ALLOW_INSECURE_PRIVATE_WS

# 镜像构建/拉取逻辑
# 如果 SKIP_BUILD=true，强制跳过；否则检查镜像是否存在
if [[ "$SKIP_BUILD" == "true" ]]; then
  echo "==> Skipping image build (SKIP_BUILD=true)"
  echo "    Reusing existing image: $IMAGE_NAME"
  if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "ERROR: Image '$IMAGE_NAME' not found. Run without --skip-build first to build the image." >&2
    exit 1
  fi
elif docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  # 镜像已存在，自动跳过构建（多实例部署时复用）
  echo "==> Image already exists: $IMAGE_NAME"
  echo "    Skipping build (reuse existing image)"
  echo "    Hint: Set OPENCLAW_SKIP_BUILD=true to suppress this message"
else
  # 镜像不存在，需要构建或拉取
  if [[ "$IMAGE_NAME" == "openclaw:local" ]]; then
    echo "==> Building Docker image: $IMAGE_NAME"
    docker build \
      --build-arg "OPENCLAW_DOCKER_APT_PACKAGES=${OPENCLAW_DOCKER_APT_PACKAGES}" \
      --build-arg "OPENCLAW_EXTENSIONS=${OPENCLAW_EXTENSIONS}" \
      --build-arg "OPENCLAW_INSTALL_DOCKER_CLI=${OPENCLAW_INSTALL_DOCKER_CLI:-}" \
      -t "$IMAGE_NAME" \
      -f "$ROOT_DIR/Dockerfile" \
      "$ROOT_DIR"
  else
    echo "==> Pulling Docker image: $IMAGE_NAME"
    if ! docker pull "$IMAGE_NAME"; then
      echo "ERROR: Failed to pull image $IMAGE_NAME. Please check the image name and your access permissions." >&2
      exit 1
    fi
  fi
fi

# Ensure bind-mounted data directories are writable by the container's `node`
# user (uid 1000). Host-created dirs inherit the host user's uid which may
# differ, causing EACCES when the container tries to mkdir/write.
# Running a brief root container to chown is the portable Docker idiom --
# it works regardless of the host uid and doesn't require host-side root.
echo ""
echo "==> Fixing data-directory permissions"
# Use -xdev to restrict chown to the config-dir mount only — without it,
# the recursive chown would cross into the workspace bind mount and rewrite
# ownership of all user project files on Linux hosts.
# After fixing the config dir, only the OpenClaw metadata subdirectory
# (.openclaw/) inside the workspace gets chowned, not the user's project files.
docker compose "${COMPOSE_ARGS[@]}" run --rm --user root --entrypoint sh openclaw-cli -c \
  'find /home/node/.openclaw -xdev -exec chown node:node {} +; \
   [ -d /home/node/.openclaw/workspace/.openclaw ] && chown -R node:node /home/node/.openclaw/workspace/.openclaw || true'

if [[ "$NO_ONBOARD" != "true" ]]; then
  echo ""
  echo "==> Onboarding (interactive)"
  echo "Docker setup pins Gateway mode to local."
  echo "Gateway runtime bind comes from OPENCLAW_GATEWAY_BIND (default: lan)."
  echo "Current runtime bind: $OPENCLAW_GATEWAY_BIND"
  echo "Gateway token: $OPENCLAW_GATEWAY_TOKEN"
  echo "Tailscale exposure: Off (use host-level tailnet/Tailscale setup separately)."
  echo "Install Gateway daemon: No (managed by Docker Compose)"
  echo ""
  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-cli onboard --mode local --no-install-daemon

  echo ""
  echo "==> Docker gateway defaults"
  sync_gateway_mode_and_bind
else
  echo ""
  echo "==> Skipping onboarding (NO_ONBOARD=true)"
  # 自动生成 gateway token（如果未设置）
  if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
    echo "==> Generating gateway token..."
    if command -v node >/dev/null 2>&1; then
      OPENCLAW_GATEWAY_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
    else
      # 回退方案：使用 /dev/urandom
      OPENCLAW_GATEWAY_TOKEN="$(head -c 32 /dev/urandom | xxd -p)"
    fi
    export OPENCLAW_GATEWAY_TOKEN
  fi
  echo "Gateway token: ${OPENCLAW_GATEWAY_TOKEN}"

  # 设置 gateway token 到配置（通过 CLI）
  echo "==> Setting gateway token to config..."
  token_set_result=0
  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-cli \
    config set gateway.token "$OPENCLAW_GATEWAY_TOKEN" >/dev/null 2>&1 || token_set_result=$?

  # 如果 CLI 方式失败，直接修改配置文件
  if [[ $token_set_result -ne 0 ]]; then
    echo "CLI config failed, writing config file directly..."
    config_file="$OPENCLAW_CONFIG_DIR/openclaw.json"
    if [[ -f "$config_file" ]]; then
      # 使用 node 直接修改 JSON 文件
      docker compose "${COMPOSE_ARGS[@]}" run --rm --entrypoint node openclaw-cli -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('/home/node/.openclaw/openclaw.json', 'utf-8'));
        config.gateway = config.gateway || {};
        config.gateway.auth = config.gateway.auth || {};
        config.gateway.auth.token = \"$OPENCLAW_GATEWAY_TOKEN\";
        fs.writeFileSync('/home/node/.openclaw/openclaw.json', JSON.stringify(config, null, 2) + '\n');
      "
    fi
  fi

  # 写入 .env 文件持久化
  if [[ -f "$ENV_FILE" ]]; then
    # 如果已存在，更新 token
    if grep -q "^OPENCLAW_GATEWAY_TOKEN=" "$ENV_FILE" 2>/dev/null; then
      sed -i "s/^OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN/" "$ENV_FILE"
    else
      echo "OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN" >> "$ENV_FILE"
    fi
  else
    echo "OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN" > "$ENV_FILE"
  fi

  sync_gateway_mode_and_bind
fi

echo ""
echo "==> Control UI origin allowlist"
ensure_control_ui_allowed_origins

echo ""
echo "==> Provider setup (optional)"
echo "WhatsApp (QR):"
echo "  ${COMPOSE_HINT} run --rm openclaw-cli channels login"
echo "Telegram (bot token):"
echo "  ${COMPOSE_HINT} run --rm openclaw-cli channels add --channel telegram --token <token>"
echo "Discord (bot token):"
echo "  ${COMPOSE_HINT} run --rm openclaw-cli channels add --channel discord --token <token>"
echo "Docs: https://docs.openclaw.ai/channels"

echo ""
echo "==> Starting gateway"
docker compose "${COMPOSE_ARGS[@]}" up -d openclaw-gateway

# --- Sandbox setup (opt-in via OPENCLAW_SANDBOX=1) ---
if [[ -n "$SANDBOX_ENABLED" ]]; then
  echo ""
  echo "==> Sandbox setup"

  # Build sandbox image if Dockerfile.sandbox exists.
  if [[ -f "$ROOT_DIR/Dockerfile.sandbox" ]]; then
    echo "Building sandbox image: openclaw-sandbox:bookworm-slim"
    docker build \
      -t "openclaw-sandbox:bookworm-slim" \
      -f "$ROOT_DIR/Dockerfile.sandbox" \
      "$ROOT_DIR"
  else
    echo "WARNING: Dockerfile.sandbox not found in $ROOT_DIR" >&2
    echo "  Sandbox config will be applied but no sandbox image will be built." >&2
    echo "  Agent exec may fail if the configured sandbox image does not exist." >&2
  fi

  # Defense-in-depth: verify Docker CLI in the running image before enabling
  # sandbox. This avoids claiming sandbox is enabled when the image cannot
  # launch sandbox containers.
  if ! docker compose "${COMPOSE_ARGS[@]}" run --rm --entrypoint docker openclaw-gateway --version >/dev/null 2>&1; then
    echo "WARNING: Docker CLI not found inside the container image." >&2
    echo "  Sandbox requires Docker CLI. Rebuild with --build-arg OPENCLAW_INSTALL_DOCKER_CLI=1" >&2
    echo "  or use a local build (OPENCLAW_IMAGE=openclaw:local). Skipping sandbox setup." >&2
    SANDBOX_ENABLED=""
  fi
fi

# Apply sandbox config only if prerequisites are met.
if [[ -n "$SANDBOX_ENABLED" ]]; then
  # Mount Docker socket via a dedicated compose overlay. This overlay is
  # created only after sandbox prerequisites pass, so the socket is never
  # exposed when sandbox cannot actually run.
  if [[ -S "$DOCKER_SOCKET_PATH" ]]; then
    SANDBOX_COMPOSE_FILE="$ROOT_DIR/docker-compose.sandbox.yml"
    cat >"$SANDBOX_COMPOSE_FILE" <<YAML
services:
  openclaw-gateway:
    volumes:
      - ${DOCKER_SOCKET_PATH}:/var/run/docker.sock
YAML
    if [[ -n "${DOCKER_GID:-}" ]]; then
      cat >>"$SANDBOX_COMPOSE_FILE" <<YAML
    group_add:
      - "${DOCKER_GID}"
YAML
    fi
    COMPOSE_ARGS+=("-f" "$SANDBOX_COMPOSE_FILE")
    echo "==> Sandbox: added Docker socket mount"
  else
    echo "WARNING: OPENCLAW_SANDBOX enabled but Docker socket not found at $DOCKER_SOCKET_PATH." >&2
    echo "  Sandbox requires Docker socket access. Skipping sandbox setup." >&2
    SANDBOX_ENABLED=""
  fi
fi

if [[ -n "$SANDBOX_ENABLED" ]]; then
  # Enable sandbox in OpenClaw config.
  sandbox_config_ok=true
  if ! docker compose "${COMPOSE_ARGS[@]}" run --rm --no-deps openclaw-cli \
    config set agents.defaults.sandbox.mode "non-main" >/dev/null; then
    echo "WARNING: Failed to set agents.defaults.sandbox.mode" >&2
    sandbox_config_ok=false
  fi
  if ! docker compose "${COMPOSE_ARGS[@]}" run --rm --no-deps openclaw-cli \
    config set agents.defaults.sandbox.scope "agent" >/dev/null; then
    echo "WARNING: Failed to set agents.defaults.sandbox.scope" >&2
    sandbox_config_ok=false
  fi
  if ! docker compose "${COMPOSE_ARGS[@]}" run --rm --no-deps openclaw-cli \
    config set agents.defaults.sandbox.workspaceAccess "none" >/dev/null; then
    echo "WARNING: Failed to set agents.defaults.sandbox.workspaceAccess" >&2
    sandbox_config_ok=false
  fi

  if [[ "$sandbox_config_ok" == true ]]; then
    echo "Sandbox enabled: mode=non-main, scope=agent, workspaceAccess=none"
    echo "Docs: https://docs.openclaw.ai/gateway/sandboxing"
    # Restart gateway with sandbox compose overlay to pick up socket mount + config.
    docker compose "${COMPOSE_ARGS[@]}" up -d openclaw-gateway
  else
    echo "WARNING: Sandbox config was partially applied. Check errors above." >&2
    echo "  Skipping gateway restart to avoid exposing Docker socket without a full sandbox policy." >&2
    if ! docker compose "${BASE_COMPOSE_ARGS[@]}" run --rm --no-deps openclaw-cli \
      config set agents.defaults.sandbox.mode "off" >/dev/null; then
      echo "WARNING: Failed to roll back agents.defaults.sandbox.mode to off" >&2
    else
      echo "Sandbox mode rolled back to off due to partial sandbox config failure."
    fi
    if [[ -n "${SANDBOX_COMPOSE_FILE:-}" ]]; then
      rm -f "$SANDBOX_COMPOSE_FILE"
    fi
    # Ensure gateway service definition is reset without sandbox overlay mount.
    docker compose "${BASE_COMPOSE_ARGS[@]}" up -d --force-recreate openclaw-gateway
  fi
else
  # Keep reruns deterministic: if sandbox is not active for this run, reset
  # persisted sandbox mode so future execs do not require docker.sock by stale
  # config alone.
  if ! docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-cli \
    config set agents.defaults.sandbox.mode "off" >/dev/null; then
    echo "WARNING: Failed to reset agents.defaults.sandbox.mode to off" >&2
  fi
  if [[ -f "$ROOT_DIR/docker-compose.sandbox.yml" ]]; then
    rm -f "$ROOT_DIR/docker-compose.sandbox.yml"
  fi
fi

echo ""
echo "Gateway running with host port mapping."
echo "Access from tailnet devices via the host's tailnet IP."
echo "Config: $OPENCLAW_CONFIG_DIR"
echo "Workspace: $OPENCLAW_WORKSPACE_DIR"
echo "Token: $OPENCLAW_GATEWAY_TOKEN"
echo ""
echo "Commands:"
echo "  ${COMPOSE_HINT} logs -f openclaw-gateway"
echo "  ${COMPOSE_HINT} exec openclaw-gateway node dist/index.js health --token \"$OPENCLAW_GATEWAY_TOKEN\""
