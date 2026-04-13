#!/usr/bin/env bash
# =============================================================================
# OpenClaw 多实例管理脚本
# =============================================================================
# 功能：
#   - 列出所有实例
#   - 启动/停止/重启实例
#   - 查看实例状态和日志
#   - 重新部署实例（清理后重新部署）
#
# 使用方式：
#   ./manage-instances.sh list                    # 列出所有实例
#   ./manage-instances.sh start <instance_id>     # 启动实例
#   ./manage-instances.sh stop <instance_id>      # 停止实例
#   ./manage-instances.sh restart <instance_id>   # 重启实例
#   ./manage-instances.sh status <instance_id>    # 查看实例状态
#   ./manage-instances.sh logs <instance_id>      # 查看实例日志
#   ./manage-instances.sh redeploy <instance_id>  # 重新部署实例
#
# 环境变量：
#   OPENCLAW_BASE_DIR   - 实例基础目录，默认：$HOME/.openclaw
#   OPENCLAW_PORT_OFFSET - 端口偏移量（ redeploy 时使用）
#   OPENCLAW_NO_ONBOARD  - 是否跳过 onboarding（redeploy 时使用）
#   OPENCLAW_SKIP_BUILD  - 是否跳过镜像构建（redeploy 时使用）
# =============================================================================
set -euo pipefail

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 基础配置
BASE_DIR="${OPENCLAW_BASE_DIR:-$HOME/.openclaw}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 支持多实例部署目录结构（与 docker-instance-setup.sh 保持一致）
OPENCLAW_INSTANCE_BASE_DIR="${OPENCLAW_INSTANCE_BASE_DIR:-/data/openclaw/openclaw_instances/}"

# -----------------------------------------------------------------------------
# 辅助函数
# -----------------------------------------------------------------------------

# 输出错误信息并退出
fail() {
  echo -e "${RED}ERROR: $*${NC}" >&2
  exit 1
}

# 输出成功信息
success() {
  echo -e "${GREEN}$*${NC}"
}

# 输出警告信息
warn() {
  echo -e "${YELLOW}WARNING: $*${NC}"
}

# 输出信息
info() {
  echo -e "${BLUE}$*${NC}"
}

# 获取所有实例 ID
get_all_instances() {
  local instances=()

  # 检查多实例部署目录结构（/data/openclaw/openclaw_instances/）
  if [[ -d "$OPENCLAW_INSTANCE_BASE_DIR" ]]; then
    for dir in "$OPENCLAW_INSTANCE_BASE_DIR"*/; do
      if [[ -d "$dir" ]]; then
        local instance_id
        instance_id="$(basename "$dir")"
        if [[ -n "$instance_id" ]]; then
          instances+=("$instance_id")
        fi
      fi
    done
  fi

  # 检查默认目录结构（~/.openclaw-*）
  for dir in "$BASE_DIR"-*/; do
    if [[ -d "$dir" ]]; then
      local instance_id
      instance_id="$(basename "$dir" | sed "s/^$(basename "$BASE_DIR")-//")"
      if [[ -n "$instance_id" && "$instance_id" != "$(basename "$BASE_DIR")" ]]; then
        # 避免重复添加
        local already_added=false
        for existing in "${instances[@]}"; do
          if [[ "$existing" == "$instance_id" ]]; then
            already_added=true
            break
          fi
        done
        if [[ "$already_added" == false ]]; then
          instances+=("$instance_id")
        fi
      fi
    fi
  done

  # 检查是否有 default 实例
  if [[ -d "$BASE_DIR" && -d "$BASE_DIR/identity" ]]; then
    if [[ -f "$BASE_DIR/openclaw.json" ]] || [[ -f "$BASE_DIR/.env" ]]; then
      instances=("default" "${instances[@]}")
    fi
  fi

  if [[ ${#instances[@]} -eq 0 ]]; then
    echo ""
  else
    printf '%s\n' "${instances[@]}"
  fi
}

# 检查实例是否存在
instance_exists() {
  local instance_id="$1"

  # 检查多实例部署目录结构
  if [[ -d "$OPENCLAW_INSTANCE_BASE_DIR$instance_id" ]]; then
    return 0
  fi

  # 检查默认目录结构
  if [[ "$instance_id" == "default" ]]; then
    [[ -d "$BASE_DIR" ]]
  else
    [[ -d "$BASE_DIR-$instance_id" ]]
  fi
}

# 获取实例的配置目录
get_config_dir() {
  local instance_id="$1"

  # 优先检查多实例部署目录结构
  if [[ -d "$OPENCLAW_INSTANCE_BASE_DIR$instance_id" ]]; then
    echo "$OPENCLAW_INSTANCE_BASE_DIR$instance_id"
    return
  fi

  # 默认模式
  if [[ "$instance_id" == "default" ]]; then
    echo "$BASE_DIR"
  else
    echo "$BASE_DIR-$instance_id"
  fi
}

# 获取实例的环境文件
get_env_file() {
  local instance_id="$1"
  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  # 优先从实例配置目录读取（每个实例应有独立的 .env）
  if [[ -f "$config_dir/.env" ]]; then
    echo "$config_dir/.env"
    return
  fi

  # 备用：查找脚本所在目录的 .env（需要匹配当前实例）
  if [[ -f "$SCRIPT_DIR/.env" ]]; then
    local env_content
    env_content="$(cat "$SCRIPT_DIR/.env" 2>/dev/null)"
    if echo "$env_content" | grep -q "OPENCLAW_INSTANCE_ID=$instance_id" 2>/dev/null || \
       echo "$env_content" | grep -q "OPENCLAW_CONFIG_DIR=$config_dir" 2>/dev/null; then
      echo "$SCRIPT_DIR/.env"
      return
    fi
  fi

  # 返回空的 env_file 路径（如果找不到）
  echo ""
}

# 从实例配置目录的 .env 读取变量
read_instance_env() {
  local instance_id="$1"
  local var_name="$2"
  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  # 先从实例目录的 .env 读取
  local env_file="$config_dir/.env"
  if [[ -f "$env_file" ]]; then
    local value
    value="$(grep "^${var_name}=" "$env_file" 2>/dev/null | cut -d'=' -f2- | tr -d '\r')"
    if [[ -n "$value" ]]; then
      echo "$value"
      return
    fi
  fi

  # 如果配置目录没有 .env，尝试从 openclaw.json 读取 token
  if [[ "$var_name" == "OPENCLAW_GATEWAY_TOKEN" ]]; then
    local token
    token="$(ssh_run node -e "
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync('$config_dir/openclaw.json', 'utf8'));
      const token = config?.gateway?.auth?.token;
      if (token) process.stdout.write(token);
    " 2>/dev/null)" || true
    if [[ -n "$token" ]]; then
      echo "$token"
      return
    fi
  fi
}

# SSH 执行远程命令（用于 90.6 服务器）
ssh_run() {
  ssh -o ConnectTimeout=5 root@192.168.90.6 "$@" 2>/dev/null
}

# 获取实例的 Gateway 端口
get_gateway_port() {
  local instance_id="$1"

  # 优先从脚本目录的 .env 文件读取（多实例部署模式）
  if [[ -f "$SCRIPT_DIR/.env" ]]; then
    local port
    port="$(grep "^OPENCLAW_GATEWAY_PORT=" "$SCRIPT_DIR/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '\r')"
    if [[ -n "$port" ]]; then
      echo "$port"
      return
    fi
  fi

  # 从配置目录的环境文件读取
  local config_dir
  config_dir="$(get_config_dir "$instance_id")"
  local env_file="$config_dir/.env"

  if [[ -f "$env_file" ]]; then
    local port
    port="$(grep "^OPENCLAW_GATEWAY_PORT=" "$env_file" 2>/dev/null | cut -d'=' -f2- | tr -d '\r')"
    if [[ -n "$port" ]]; then
      echo "$port"
      return
    fi
  fi

  # 尝试从 PORT_OFFSET 推算
  local port_offset="${OPENCLAW_PORT_OFFSET:-0}"
  if [[ "$port_offset" != "0" ]]; then
    echo "$((18789 + port_offset))"
    return
  fi

  # 尝试从实例 ID 推算（如果实例 ID 包含数字）
  if [[ "$instance_id" =~ [0-9]+ ]]; then
    local offset
    offset="$(echo "$instance_id" | grep -oE '[0-9]+' | head -1)"
    if [[ -n "$offset" && "$offset" != "0" ]]; then
      echo "$((18789 + offset))"
      return
    fi
  fi

  # 默认端口
  echo "18789"
}

# 检查 Docker 容器是否在运行
container_running() {
  local instance_id="$1"
  local compose_project="openclaw-${instance_id}"

  # 使用 docker compose ps 检查容器状态
  if docker compose -p "$compose_project" ps --format '{{.State}}' 2>/dev/null | grep -qi "running"; then
    return 0
  fi

  # 备用方案：直接使用 docker ps 检查容器名
  local container_name="openclaw-${instance_id}-openclaw-gateway-1"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
    return 0
  fi

  return 1
}

# 显示使用说明
show_usage() {
  cat <<EOF
OpenClaw 多实例管理脚本

使用方式:
  \$0 list                    列出所有实例
  \$0 start <instance_id>     启动实例
  \$0 stop <instance_id>      停止实例
  \$0 restart <instance_id>   重启实例（不重建容器）
  \$0 status <instance_id>    查看实例状态
  \$0 logs <instance_id>      查看实例日志
  \$0 redeploy <instance_id>  重新部署实例（清理后重新部署）
  \$0 rebuild <instance_id>   重建容器（使用新镜像，保留配置）

实例 ID:
  - default: 默认实例（配置目录：\$BASE_DIR）
  - 其他：自定义实例（配置目录：\$BASE_DIR-<instance_id>）

示例:
  \$0 list
  \$0 start gw1
  \$0 stop gw1
  \$0 logs default
  \$0 rebuild pro1

重建选项（环境变量）:
  OPENCLAW_IMAGE=openclaw:v2   - 指定使用的镜像，默认：openclaw:local
  OPENCLAW_SKIP_BUILD=true      - 跳过镜像构建，默认：true

重建示例:
  \$0 rebuild pro1
  OPENCLAW_IMAGE=openclaw:v2 \$0 rebuild pro1

重新部署选项（环境变量）:
  OPENCLAW_PORT_OFFSET       - 端口偏移量，默认：0
  OPENCLAW_NO_ONBOARD=true   - 跳过 onboarding，默认：true
  OPENCLAW_SKIP_BUILD=true   - 跳过镜像构建，默认：false
  OPENCLAW_NEW_TOKEN=true    - 生成新 token，默认：false

重新部署示例:
  \$0 redeploy gw1
  OPENCLAW_NEW_TOKEN=true \$0 redeploy gw1
  OPENCLAW_SKIP_BUILD=true \$0 redeploy gw1

EOF
}

# -----------------------------------------------------------------------------
# 命令实现
# -----------------------------------------------------------------------------

# 列出所有实例
cmd_list() {
  info "OpenClaw 实例列表:"
  echo ""

  local instances
  instances="$(get_all_instances)"

  if [[ -z "$instances" ]]; then
    warn "未找到任何实例"
    echo ""
    echo "使用 ./docker-setup.sh 创建新实例："
    echo "  ./docker-setup.sh                                    # 创建默认实例"
    echo "  OPENCLAW_INSTANCE_ID=gw1 ./docker-setup.sh           # 创建实例 gw1"
    return 0
  fi

  printf "%-20s %-20s %-15s %s\n" "INSTANCE_ID" "CONFIG_DIR" "PORT" "STATUS"
  printf "%-20s %-20s %-15s %s\n" "-----------" "----------" "----" "------"

  while IFS= read -r instance_id; do
    if [[ -n "$instance_id" ]]; then
      local config_dir
      local port
      local status
      config_dir="$(get_config_dir "$instance_id")"
      port="$(get_gateway_port "$instance_id")"
      if container_running "$instance_id"; then
        status="${GREEN}running${NC}"
      else
        status="${YELLOW}stopped${NC}"
      fi
      printf "%-20s %-20s %-15s " "$instance_id" "$config_dir" "$port"
      echo -e "$status"
    fi
  done <<<"$instances"

  echo ""
}

# 启动实例
cmd_start() {
  local instance_id="$1"

  if ! instance_exists "$instance_id"; then
    fail "实例 '$instance_id' 不存在"
  fi

  if container_running "$instance_id"; then
    warn "实例 '$instance_id' 已在运行中"
    return 0
  fi

  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  info "启动实例：$instance_id"
  info "配置目录：$config_dir"

  # 设置环境变量并启动
  export OPENCLAW_CONFIG_DIR="$config_dir"
  export OPENCLAW_WORKSPACE_DIR="$config_dir/workspace"

  # 从环境文件读取其他变量
  local env_file
  env_file="$(get_env_file "$instance_id")"
  if [[ -n "$env_file" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$env_file"
    set +a
  fi

  # 默认值
  export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
  export OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT:-18790}"
  export OPENCLAW_IMAGE="${OPENCLAW_IMAGE:-openclaw:local}"

  cd "$SCRIPT_DIR"
  docker compose up -d openclaw-gateway

  success "实例 '$instance_id' 已启动"
}

# 停止实例
cmd_stop() {
  local instance_id="$1"

  if ! instance_exists "$instance_id"; then
    fail "实例 '$instance_id' 不存在"
  fi

  if ! container_running "$instance_id"; then
    warn "实例 '$instance_id' 已停止"
    return 0
  fi

  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  info "停止实例：$instance_id"

  # 设置环境变量并停止
  export OPENCLAW_CONFIG_DIR="$config_dir"
  export OPENCLAW_WORKSPACE_DIR="$config_dir/workspace"

  # 从环境文件读取其他变量
  local env_file
  env_file="$(get_env_file "$instance_id")"
  if [[ -n "$env_file" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$env_file"
    set +a
  fi

  cd "$SCRIPT_DIR"
  docker compose stop openclaw-gateway

  success "实例 '$instance_id' 已停止"
}

# 重启实例
cmd_restart() {
  local instance_id="$1"

  if ! instance_exists "$instance_id"; then
    fail "实例 '$instance_id' 不存在"
  fi

  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  info "重启实例：$instance_id"

  # 从实例配置目录读取 .env
  local env_file="$config_dir/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  # 设置环境变量
  export OPENCLAW_CONFIG_DIR="$config_dir"
  export OPENCLAW_WORKSPACE_DIR="$config_dir/workspace"
  export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
  export OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT:-18790}"
  export OPENCLAW_IMAGE="${OPENCLAW_IMAGE:-openclaw:local}"

  cd "$SCRIPT_DIR"
  docker compose restart openclaw-gateway

  success "实例 '$instance_id' 已重启"
}

# 重建实例（使用新镜像重建容器，保留配置）
cmd_rebuild() {
  local instance_id="$1"

  if ! instance_exists "$instance_id"; then
    fail "实例 '$instance_id' 不存在"
  fi

  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  info "重建实例：$instance_id"
  info "配置目录：$config_dir"

  echo ""
  warn "即将重建实例 '$instance_id' 的容器"
  warn "此操作将："
  echo "  1. 停止并删除当前容器"
  echo "  2. 使用新镜像重新创建容器"
  echo "  3. 保留配置文件（不丢失）"
  echo ""

  # 获取当前镜像（如果没有设置，默认为 openclaw:local）
  local current_image="${OPENCLAW_IMAGE:-openclaw:local}"
  echo "当前镜像：$current_image"
  echo ""

  # 从实例配置目录读取 .env
  local env_file="$config_dir/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  # 从 openclaw.json 读取 token（确保不丢失）
  local existing_token=""
  if [[ -f "$config_dir/openclaw.json" ]]; then
    existing_token="$(node -e "
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync('$config_dir/openclaw.json', 'utf8'));
      const token = config?.gateway?.auth?.token;
      if (token) process.stdout.write(token);
    " 2>/dev/null)" || true
  fi

  # 设置环境变量
  export OPENCLAW_INSTANCE_ID="$instance_id"
  export OPENCLAW_CONFIG_DIR="$config_dir"
  export OPENCLAW_WORKSPACE_DIR="$config_dir/workspace"
  export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
  export OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT:-18790}"
  export OPENCLAW_IMAGE="${OPENCLAW_IMAGE:-$current_image}"
  export OPENCLAW_SKIP_BUILD="${OPENCLAW_SKIP_BUILD:-true}"

  # 如果有现有的 token，复用它
  if [[ -n "$existing_token" ]]; then
    export OPENCLAW_GATEWAY_TOKEN="$existing_token"
  fi

  cd "$SCRIPT_DIR"

  # 停止并删除容器
  info "步骤 1/2: 清理旧容器..."
  local compose_project="openclaw-${instance_id}"
  docker compose -p "$compose_project" down --remove-orphans 2>/dev/null || true

  # 直接删除容器（确保清理干净）
  local container_name="openclaw-${instance_id}-openclaw-gateway-1"
  if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
    info "  删除容器：$container_name"
    docker rm -f "$container_name" 2>/dev/null || true
  fi

  # 重新创建容器
  info "步骤 2/2: 创建新容器..."
  if [[ -x "$SCRIPT_DIR/docker-instance-setup.sh" ]]; then
    OPENCLAW_SKIP_BUILD=true OPENCLAW_NO_ONBOARD=true \
      OPENCLAW_NEW_TOKEN=false \
      "$SCRIPT_DIR/docker-instance-setup.sh"
  else
    fail "找不到 docker-instance-setup.sh 脚本"
  fi

  # 验证
  sleep 3
  if container_running "$instance_id"; then
    success "实例 '$instance_id' 重建成功!"
    info "使用 '$0 status $instance_id' 查看状态"
  else
    warn "容器可能还在启动中，请稍后检查状态"
  fi
}

# 查看实例状态
cmd_status() {
  local instance_id="$1"

  if ! instance_exists "$instance_id"; then
    fail "实例 '$instance_id' 不存在"
  fi

  local config_dir
  local port
  local container_name

  config_dir="$(get_config_dir "$instance_id")"
  port="$(get_gateway_port "$instance_id")"

  # 使用 docker compose 的容器命名规则：openclaw-{instance_id}-openclaw-gateway-1
  container_name="openclaw-${instance_id}-openclaw-gateway-1"

  echo ""
  info "=== 实例状态：$instance_id ==="
  echo ""
  echo "配置目录：$config_dir"
  echo "Gateway 端口：$port"
  echo "容器名称：$container_name"

  if container_running "$instance_id"; then
    echo "状态：${GREEN}运行中${NC}"
    echo ""
    docker ps --filter "name=$container_name" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  else
    echo "状态：${YELLOW}已停止${NC}"
  fi

  echo ""
}

# 查看实例日志
cmd_logs() {
  local instance_id="$1"

  if ! instance_exists "$instance_id"; then
    fail "实例 '$instance_id' 不存在"
  fi

  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  info "查看实例 '$instance_id' 的日志"

  # 设置环境变量
  export OPENCLAW_CONFIG_DIR="$config_dir"
  export OPENCLAW_WORKSPACE_DIR="$config_dir/workspace"

  # 从环境文件读取其他变量
  local env_file
  env_file="$(get_env_file "$instance_id")"
  if [[ -n "$env_file" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$env_file"
    set +a
  fi

  cd "$SCRIPT_DIR"
  docker compose logs -f openclaw-gateway
}

# 重新部署实例
cmd_redeploy() {
  local instance_id="$1"

  info "重新部署实例：$instance_id"

  # 检查实例是否存在
  if ! instance_exists "$instance_id"; then
    fail "实例 '$instance_id' 不存在"
  fi

  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  # 显示警告
  echo ""
  warn "即将重新部署实例 '$instance_id'"
  warn "此操作将："
  echo "  1. 停止并删除当前容器"
  echo "  2. 保留配置文件和数据"
  echo "  3. 重新创建容器"
  echo ""

  # 步骤 1/3: 清理容器
  info "步骤 1/3: 清理容器..."

  # 从实例配置目录读取 .env
  local env_file="$config_dir/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  # 设置环境变量
  export OPENCLAW_INSTANCE_ID="$instance_id"
  export OPENCLAW_CONFIG_DIR="$config_dir"
  export OPENCLAW_WORKSPACE_DIR="$config_dir/workspace"
  export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
  export OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT:-18790}"
  export OPENCLAW_IMAGE="${OPENCLAW_IMAGE:-openclaw:local}"

  # 使用 docker compose down 清理容器
  cd "$SCRIPT_DIR"
  local compose_project="openclaw-${instance_id}"
  docker compose -p "$compose_project" down --remove-orphans 2>/dev/null || true

  # 备用方案：直接删除容器
  local container_names
  container_names=$(docker ps -a --filter "label=com.docker.compose.project=$compose_project" --format "{{.Names}}" 2>/dev/null || true)
  if [[ -n "$container_names" ]]; then
    for container in $container_names; do
      info "  删除容器：$container"
      docker rm -f "$container" 2>/dev/null || true
    done
  fi

  info "容器清理完成"

  # 步骤 2/3: 重新部署
  info "步骤 2/3: 重新部署..."

  # 设置部署环境变量
  export OPENCLAW_INSTANCE_ID="$instance_id"
  export OPENCLAW_NO_ONBOARD="${OPENCLAW_NO_ONBOARD:-true}"
  export OPENCLAW_SKIP_BUILD="${OPENCLAW_SKIP_BUILD:-false}"
  export OPENCLAW_NEW_TOKEN="${OPENCLAW_NEW_TOKEN:-false}"

  # 如果有端口偏移，也传递
  if [[ -n "${OPENCLAW_PORT_OFFSET:-}" ]]; then
    export OPENCLAW_PORT_OFFSET
  fi

  if [[ -x "$SCRIPT_DIR/docker-instance-setup.sh" ]]; then
    "$SCRIPT_DIR/docker-instance-setup.sh"
  else
    fail "找不到 docker-instance-setup.sh 脚本"
  fi

  # 步骤 3/3: 验证部署
  info "步骤 3/3: 验证部署..."
  sleep 3

  if container_running "$instance_id"; then
    success "实例 '$instance_id' 重新部署成功!"
  else
    warn "容器可能还在启动中，请稍后检查状态"
  fi

  echo ""
  info "使用 '$0 status $instance_id' 查看实例状态"
  info "使用 '$0 logs $instance_id' 查看日志"
}

# -----------------------------------------------------------------------------
# 主程序
# -----------------------------------------------------------------------------

if [[ $# -lt 1 ]]; then
  show_usage
  exit 1
fi

command="$1"
shift

case "$command" in
  list)
    cmd_list
    ;;
  start)
    if [[ $# -lt 1 ]]; then
      fail "请指定实例 ID"
    fi
    cmd_start "$1"
    ;;
  stop)
    if [[ $# -lt 1 ]]; then
      fail "请指定实例 ID"
    fi
    cmd_stop "$1"
    ;;
  restart)
    if [[ $# -lt 1 ]]; then
      fail "请指定实例 ID"
    fi
    cmd_restart "$1"
    ;;
  status)
    if [[ $# -lt 1 ]]; then
      fail "请指定实例 ID"
    fi
    cmd_status "$1"
    ;;
  logs)
    if [[ $# -lt 1 ]]; then
      fail "请指定实例 ID"
    fi
    cmd_logs "$1"
    ;;
  rebuild)
    if [[ $# -lt 1 ]]; then
      fail "请指定实例 ID"
    fi
    cmd_rebuild "$1"
    ;;
  redeploy)
    if [[ $# -lt 1 ]]; then
      fail "请指定实例 ID"
    fi
    cmd_redeploy "$1"
    ;;
  help|--help|-h)
    show_usage
    ;;
  *)
    fail "未知命令：$command"
    ;;
esac
