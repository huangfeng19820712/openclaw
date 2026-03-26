#!/bin/bash
#
# Node Auto-Register 插件拷贝脚本
# 用于将插件拷贝到指定容器的 extensions 目录
#
# 用法:
#   ./copy-to-extensions.sh <container_id>
#
# 参数:
#   container_id - OpenClaw 实例名称（如：gw1, gw2, node-auto-register 等）
#
# 示例:
#   ./copy-to-extensions.sh gw1
#   ./copy-to-extensions.sh node-auto-register
#

set -e

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE_DIR="/data/workspace/openclaw"
INSTANCE_BASE_DIR="/data/openclaw/openclaw_instances"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "${BLUE}=============================================${NC}"; }

show_help() {
  cat << EOF
Node Auto-Register 插件拷贝到 extensions 目录脚本

用法: $0 <container_id>

参数:
  container_id - OpenClaw 实例名称 (如：gw1, gw2, node-auto-register 等)

示例:
  $0 gw1                    # 拷贝到 gw1 实例的 extensions 目录
  $0 node-auto-register     # 拷贝到 node-auto-register 实例的 extensions 目录

说明:
  此脚本将插件从 /data/workspace/openclaw/plugins/node-auto-register
  拷贝到 /data/openclaw/openclaw_instances/<container_id>/extensions/

EOF
}

# 检查参数
if [ $# -eq 0 ]; then
  log_error "缺少容器 ID 参数"
  show_help
  exit 1
fi

if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
  show_help
  exit 0
fi

INSTANCE_ID="$1"
CONFIG_DIR="${INSTANCE_BASE_DIR}/${INSTANCE_ID}"
EXTENSIONS_DIR="${CONFIG_DIR}/extensions"

# 确认配置
log_header
log_info "Node Auto-Register 插件拷贝脚本"
log_header
echo ""
log_info "配置:"
echo "  实例名称：$INSTANCE_ID"
echo "  配置目录：$CONFIG_DIR"
echo "  目标目录：$EXTENSIONS_DIR"
echo ""

# 检查源目录是否存在
if [ ! -d "$PLUGIN_DIR" ]; then
  log_error "源目录不存在：$PLUGIN_DIR"
  exit 1
fi

# 检查配置目录是否存在
if [ ! -d "$CONFIG_DIR" ]; then
  log_error "配置目录不存在：$CONFIG_DIR"
  log_error "请确认实例 '$INSTANCE_ID' 已部署"
  exit 1
fi

# 创建 extensions 目录
log_header
log_info "步骤 1: 创建 extensions 目录..."
log_header

mkdir -p "$EXTENSIONS_DIR"
log_info "extensions 目录创建完成：$EXTENSIONS_DIR"

echo ""

# 拷贝插件代码
log_header
log_info "步骤 2: 拷贝插件代码..."
log_header

log_info "源目录：$PLUGIN_DIR"
log_info "目标目录：$EXTENSIONS_DIR/node-auto-register"

# 如果已存在，先删除
if [ -L "$EXTENSIONS_DIR/node-auto-register" ] || [ -d "$EXTENSIONS_DIR/node-auto-register" ]; then
  log_warn "发现现有插件，正在清理..."
  rm -rf "$EXTENSIONS_DIR/node-auto-register"
fi

# 拷贝插件代码（直接复制，不使用符号链接，因为容器内无法访问外部路径）
log_info "复制插件代码到 extensions 目录..."
cp -r "$PLUGIN_DIR" "$EXTENSIONS_DIR/node-auto-register"

log_info "插件代码复制完成"

echo ""

# 验证插件文件
log_header
log_info "步骤 3: 验证插件文件..."
log_header

PLUGIN_TARGET="$EXTENSIONS_DIR/node-auto-register"

if [ -d "$PLUGIN_TARGET" ]; then
  log_info "插件目录存在：$PLUGIN_TARGET"

  # 检查关键文件
  for file in "package.json" "openclaw.plugin.json" "src/index.js"; do
    if [ -f "$PLUGIN_TARGET/$file" ]; then
      log_info "  ✓ $file 存在"
    else
      log_warn "  ✗ $file 不存在"
    fi
  done
else
  log_error "插件目录不存在：$PLUGIN_TARGET"
  exit 1
fi

echo ""

# 安装 npm 依赖
log_header
log_info "步骤 4: 安装 npm 依赖..."
log_header

if [ -f "$PLUGIN_TARGET/package.json" ]; then
  log_info "正在安装依赖..."
  cd "$PLUGIN_TARGET"
  if command -v npm &> /dev/null; then
    npm install --production 2>&1 | tail -5
    log_info "npm 依赖安装完成"
  else
    log_warn "npm 未安装，跳过依赖安装"
    log_warn "请手动运行：cd $PLUGIN_TARGET && npm install"
  fi
else
  log_warn "找不到 package.json，跳过依赖安装"
fi

echo ""

# 完成
log_header
log_info "✅ 插件拷贝完成！"
log_header
echo ""
log_info "下一步操作:"
echo "  1. 重启容器以加载插件:"
echo "     docker restart openclaw-${INSTANCE_ID}-openclaw-gateway-1"
echo ""
echo "  2. 查看插件日志:"
echo "     docker logs openclaw-${INSTANCE_ID}-openclaw-gateway-1 2>&1 | grep -E 'node-auto-register|one-shot-pair'"
echo ""
echo "  3. 测试一键配对 API:"
echo "     curl \"http://192.168.90.6:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=<YOUR_INVITE_CODE>\""
echo ""
