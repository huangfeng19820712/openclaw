#!/usr/bin/env bash
# =============================================================================
# OpenClaw 多实例管理脚本
# =============================================================================
# 功能：
#   - 列出所有实例
#   - 启动/停止/重启实例
#   - 查看实例状态和日志
#
# 使用方式：
#   ./manage-instances.sh list                    # 列出所有实例
#   ./manage-instances.sh start <instance_id>     # 启动实例
#   ./manage-instances.sh stop <instance_id>      # 停止实例
#   ./manage-instances.sh restart <instance_id>   # 重启实例
#   ./manage-instances.sh status <instance_id>    # 查看实例状态
#   ./manage-instances.sh logs <instance_id>      # 查看实例日志
#
# 环境变量：
#   OPENCLAW_BASE_DIR   - 实例基础目录，默认：$HOME/.openclaw
# =============================================================================
set -euo pipefail

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 基础配置
BASE_DIR="${OPENCLAW_BASE_DIR:-$HOME/.openclaw}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
  for dir in "$BASE_DIR"-*/; do
    if [[ -d "$dir" ]]; then
      local instance_id
      instance_id="$(basename "$dir" | sed "s/^$(basename "$BASE_DIR")-//")"
      if [[ -n "$instance_id" && "$instance_id" != "$(basename "$BASE_DIR")" ]]; then
        instances+=("$instance_id")
      fi
    fi
  done

  # 检查是否有 default 实例
  if [[ -d "$BASE_DIR" && -d "$BASE_DIR/identity" ]]; then
    # 检查 default 实例是否实际存在（配置目录存在且有配置）
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
  if [[ "$instance_id" == "default" ]]; then
    [[ -d "$BASE_DIR" ]]
  else
    [[ -d "$BASE_DIR-$instance_id" ]]
  fi
}

# 获取实例的配置目录
get_config_dir() {
  local instance_id="$1"
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
  # 优先查找 config_dir/.env，其次查找脚本所在目录的 .env
  if [[ -f "$config_dir/.env" ]]; then
    echo "$config_dir/.env"
  elif [[ -f "$SCRIPT_DIR/.env" ]]; then
    echo "$SCRIPT_DIR/.env"
  else
    echo ""
  fi
}

# 从环境文件读取变量
read_env_var() {
  local env_file="$1"
  local var_name="$2"
  if [[ -n "$env_file" && -f "$env_file" ]]; then
    grep "^${var_name}=" "$env_file" 2>/dev/null | cut -d'=' -f2- | tr -d '\r'
  fi
}

# 获取实例的 Gateway 端口
get_gateway_port() {
  local instance_id="$1"
  local env_file
  env_file="$(get_env_file "$instance_id")"
  local port
  port="$(read_env_var "$env_file" "OPENCLAW_GATEWAY_PORT")"
  if [[ -n "$port" ]]; then
    echo "$port"
  else
    # 默认端口
    if [[ "$instance_id" == "default" ]]; then
      echo "18789"
    else
      # 从实例 ID 推算端口（如果实例 ID 包含数字）
      local offset
      offset="$(echo "$instance_id" | grep -oE '[0-9]+' | head -1 || echo "0")"
      echo "$((18789 + offset))"
    fi
  fi
}

# 检查 Docker 容器是否在运行
container_running() {
  local instance_id="$1"
  local container_name="openclaw-gateway"
  # 检查是否有带实例 ID 的容器名
  if [[ "$instance_id" != "default" ]]; then
    container_name="openclaw-gateway-${instance_id}"
  fi
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"
}

# 显示使用说明
show_usage() {
  cat <<EOF
OpenClaw 多实例管理脚本

使用方式:
  $0 list                    列出所有实例
  $0 start <instance_id>     启动实例
  $0 stop <instance_id>      停止实例
  $0 restart <instance_id>   重启实例
  $0 status <instance_id>    查看实例状态
  $0 logs <instance_id>      查看实例日志

实例 ID:
  - default: 默认实例（配置目录：$BASE_DIR）
  - 其他：自定义实例（配置目录：$BASE_DIR-<instance_id>）

示例:
  $0 list
  $0 start gw1
  $0 stop gw1
  $0 logs default

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

  # 设置环境变量并重启
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
  docker compose restart openclaw-gateway

  success "实例 '$instance_id' 已重启"
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

  if [[ "$instance_id" == "default" ]]; then
    container_name="openclaw-gateway"
  else
    container_name="openclaw-gateway-${instance_id}"
  fi

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
  help|--help|-h)
    show_usage
    ;;
  *)
    fail "未知命令：$command"
    ;;
esac
