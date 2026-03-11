#!/usr/bin/env bash
# =============================================================================
# OpenClaw 实例清理脚本
# =============================================================================
# 功能：
#   - 删除指定实例的容器、网络、配置文件
#   - 批量删除所有实例
#   - 清理残留的 Docker 资源
#
# 使用方式：
#   ./cleanup-instance.sh <instance_id>              # 删除指定实例
#   ./cleanup-instance.sh --all                      # 删除所有实例
#   ./cleanup-instance.sh --prune                    # 清理残留网络/卷
#   ./cleanup-instance.sh --all --keep-data          # 删除所有实例但保留配置
#
# 选项：
#   --all        删除所有实例
#   --prune      仅清理残留的 Docker 网络和卷
#   --keep-data  保留配置文件目录（仅删除容器和网络）
#   --force      跳过确认提示
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

# 选项
KEEP_DATA=false
FORCE=false
PRUNE_ONLY=false
ALL_INSTANCES=false

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

# 确认提示
confirm() {
  if [[ "$FORCE" == true ]]; then
    return 0
  fi
  echo -n -e "${YELLOW}$* [y/N]${NC} "
  read -r response
  case "$response" in
    [yY][eE][sS] | [yY]) return 0 ;;
    *) return 1 ;;
  esac
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

# 停止并删除容器
stop_and_remove_container() {
  local instance_id="$1"
  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  info "处理实例：$instance_id"

  # 设置环境变量
  export OPENCLAW_CONFIG_DIR="$config_dir"
  export OPENCLAW_WORKSPACE_DIR="$config_dir/workspace"

  # 从环境文件读取其他变量
  local env_file="$config_dir/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  cd "$SCRIPT_DIR"

  # 停止容器
  if docker compose ps 2>/dev/null | grep -q "openclaw-gateway"; then
    info "  停止容器..."
    docker compose stop openclaw-gateway 2>/dev/null || true
  fi

  # 删除容器
  info "  删除容器..."
  docker compose down --remove-orphans 2>/dev/null || true

  # 删除网络（如果有独立网络）
  info "  清理网络..."
  local network_name="openclaw-network-${instance_id}"
  if docker network ls --format '{{.Name}}' 2>/dev/null | grep -q "^${network_name}$"; then
    docker network rm "$network_name" 2>/dev/null || true
  fi
}

# 删除配置文件
remove_config_files() {
  local instance_id="$1"
  local config_dir
  config_dir="$(get_config_dir "$instance_id")"

  if [[ -d "$config_dir" ]]; then
    info "  删除配置目录：$config_dir"
    rm -rf "$config_dir"
  fi
}

# 清理残留的 Docker 资源
prune_docker_resources() {
  info "清理残留的 Docker 资源..."

  # 查找并删除孤立的 OpenClaw 网络
  info "  清理孤立网络..."
  docker network ls --format '{{.Name}}' 2>/dev/null | grep "^openclaw-network-" | while read -r network; do
    # 检查网络是否被使用
    if ! docker network inspect "$network" 2>/dev/null | grep -q '"Containers": {}'; then
      info "    删除网络：$network"
      docker network rm "$network" 2>/dev/null || true
    fi
  done

  # 查找并删除孤立的卷
  info "  清理孤立卷..."
  docker volume ls --format '{{.Name}}' 2>/dev/null | grep "^openclaw-" | while read -r volume; do
    if ! docker volume inspect "$volume" 2>/dev/null | grep -q '"Mountpoint"'; then
      info "    删除卷：$volume"
      docker volume rm "$volume" 2>/dev/null || true
    fi
  done

  # 清理悬空的镜像
  info "  清理悬空镜像..."
  docker image prune -f 2>/dev/null || true
}

# 显示使用说明
show_usage() {
  cat <<EOF
OpenClaw 实例清理脚本

使用方式:
  $0 [选项] [instance_id]

参数:
  instance_id    要删除的实例 ID（如：default, gw1, gw2）

选项:
  --all          删除所有实例
  --prune        仅清理残留的 Docker 网络和卷
  --keep-data    保留配置文件目录
  --force        跳过确认提示

示例:
  $0 gw1                      # 删除实例 gw1 及其配置
  $0 gw1 --keep-data          # 删除实例 gw1 容器，保留配置
  $0 --all                    # 删除所有实例
  $0 --all --keep-data        # 删除所有容器，保留配置
  $0 --prune                  # 清理残留网络和卷
  $0 --prune --force          # 强制清理，无需确认

注意：
  - 删除操作会停止并移除容器
  - 默认会删除配置文件，使用 --keep-data 保留
  - 清理前请确保已备份重要配置

EOF
}

# 解析命令行参数
parse_args() {
  local instance_id=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all)
        ALL_INSTANCES=true
        shift
        ;;
      --prune)
        PRUNE_ONLY=true
        shift
        ;;
      --keep-data)
        KEEP_DATA=true
        shift
        ;;
      --force)
        FORCE=true
        shift
        ;;
      --help|-h)
        show_usage
        exit 0
        ;;
      -*)
        fail "未知选项：$1"
        ;;
      *)
        instance_id="$1"
        shift
        ;;
    esac
  done

  # 返回实例 ID（如果有）
  if [[ -n "$instance_id" ]]; then
    echo "$instance_id"
  fi
}

# -----------------------------------------------------------------------------
# 主程序
# -----------------------------------------------------------------------------

if [[ $# -lt 1 ]]; then
  show_usage
  exit 1
fi

# 解析参数
INSTANCE_ID="$(parse_args "$@")"

# 仅清理残留资源
if [[ "$PRUNE_ONLY" == true ]]; then
  if confirm "确定要清理残留的 Docker 资源吗？"; then
    prune_docker_resources
    success "清理完成"
  else
    info "已取消"
  fi
  exit 0
fi

# 删除所有实例
if [[ "$ALL_INSTANCES" == true ]]; then
  instances="$(get_all_instances)"

  if [[ -z "$instances" ]]; then
    warn "未找到任何实例"
    exit 0
  fi

  info "找到以下实例:"
  echo "$instances" | while read -r id; do
    echo "  - $id"
  done
  echo ""

  if [[ "$KEEP_DATA" == true ]]; then
    warn "将删除所有容器和网络，但保留配置文件"
  else
    warn "将删除所有实例的容器、网络和配置文件！"
  fi

  if ! confirm "确定继续吗？此操作不可逆"; then
    info "已取消"
    exit 0
  fi

  while IFS= read -r instance_id; do
    if [[ -n "$instance_id" ]]; then
      stop_and_remove_container "$instance_id"
      if [[ "$KEEP_DATA" != true ]]; then
        remove_config_files "$instance_id"
      fi
      success "实例 '$instance_id' 已清理"
      echo ""
    fi
  done <<<"$instances"

  # 清理残留资源
  prune_docker_resources

  success "所有实例已清理完成"
  exit 0
fi

# 删除指定实例
if [[ -z "$INSTANCE_ID" ]]; then
  fail "请指定实例 ID 或使用 --all 删除所有实例"
fi

if ! instance_exists "$INSTANCE_ID"; then
  fail "实例 '$INSTANCE_ID' 不存在"
fi

if [[ "$KEEP_DATA" == true ]]; then
  info "将删除实例 '$INSTANCE_ID' 的容器和网络，保留配置文件"
else
  info "将删除实例 '$INSTANCE_ID' 的容器、网络和配置文件"
fi

if ! confirm "确定继续吗？"; then
  info "已取消"
  exit 0
fi

stop_and_remove_container "$INSTANCE_ID"

if [[ "$KEEP_DATA" != true ]]; then
  remove_config_files "$INSTANCE_ID"
fi

success "实例 '$INSTANCE_ID' 已清理完成"
