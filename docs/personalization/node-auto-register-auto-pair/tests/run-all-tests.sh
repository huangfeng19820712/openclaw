#!/bin/bash
#
# Node Auto-Register 自动化测试套件 - 主入口
# 纯 API 测试方案（无需浏览器）
#
# 用法:
#   ./run-all-tests.sh           # 运行所有测试
#   ./run-all-tests.sh --api-only # 仅运行 API 测试
#   ./run-all-tests.sh tc001      # 运行单个测试
#   ./run-all-tests.sh --help     # 显示帮助
#   ./run-all-tests.sh --local   # 在本地服务器运行（不通过 SSH）
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_HOST="${TEST_HOST:-root@192.168.90.6}"
TEST_PORT="${TEST_PORT:-18889}"
LOCAL_MODE="${LOCAL_MODE:-0}"

# SSH_CMD 根据模式设置
if [ "$LOCAL_MODE" = "1" ]; then
  SSH_CMD=""
else
  SSH_CMD="ssh $TEST_HOST"
fi

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

# 测试结果
declare -A RESULTS
TOTAL_PASS=0
TOTAL_FAIL=0

show_help() {
  cat << EOF
Node Auto-Register 自动化测试套件

用法: $0 [选项] [测试用例]

选项:
  --api-only     仅运行 API 测试（跳过 E2E 测试）
  --skip-concurrent  跳过并发测试（TC-005 中的并发部分）
  --host HOST    指定测试服务器 SSH 地址 (默认：root@192.168.90.6)
  --port PORT    指定测试端口 (默认：18889)
  --help         显示此帮助信息

测试用例:
  tc001          端口偏移配置测试
  tc003          一键配对 API 测试
  tc004          邀请码验证测试
  tc005          配对状态文件测试
  all            运行所有测试（默认）

示例:
  $0                     # 运行所有测试
  $0 --api-only          # 仅运行 API 测试
  $0 tc001 tc003         # 运行指定测试
  $0 --host user@server  # 指定测试服务器

环境要求:
  - SSH 访问测试服务器
  - 测试服务器上运行 OpenClaw (Docker)
  - node-auto-register 插件已加载

EOF
}

run_test() {
  local test_name="$1"
  local test_script

  # 根据测试名称获取完整脚本名
  case "$test_name" in
    tc001) test_script="$SCRIPT_DIR/tc001-port-offset.sh" ;;
    tc003) test_script="$SCRIPT_DIR/tc003-one-shot-pair.sh" ;;
    tc004) test_script="$SCRIPT_DIR/tc004-invite-code.sh" ;;
    tc005) test_script="$SCRIPT_DIR/tc005-state-files.sh" ;;
    *) test_script="$SCRIPT_DIR/${test_name}.sh" ;;
  esac

  if [ ! -f "$test_script" ]; then
    log_error "测试脚本不存在：$test_script"
    RESULTS["$test_name"]="SKIP (脚本不存在)"
    return 1
  fi

  log_header
  log_info "运行测试：$test_name"
  log_header

  # 设置环境变量
  export SSH_HOST="$TEST_HOST"
  export PORT="$TEST_PORT"
  export SKIP_CONCURRENT="${SKIP_CONCURRENT:-0}"

  # 运行测试
  if bash "$test_script"; then
    RESULTS["$test_name"]="PASS"
    ((TOTAL_PASS++))
    return 0
  else
    RESULTS["$test_name"]="FAIL"
    ((TOTAL_FAIL++))
    return 1
  fi
}

# 解析参数
RUN_ALL=true
TESTS_TO_RUN=()
SKIP_CONCURRENT=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --api-only)
      # 纯 API 测试模式（当前只有 API 测试）
      shift
      ;;
    --skip-concurrent)
      SKIP_CONCURRENT=1
      export SKIP_CONCURRENT=1
      shift
      ;;
    --host)
      TEST_HOST="$2"
      shift 2
      ;;
    --port)
      TEST_PORT="$2"
      shift 2
      ;;
    --help)
      show_help
      exit 0
      ;;
    tc001|tc003|tc004|tc005|all)
      RUN_ALL=false
      TESTS_TO_RUN+=("$1")
      shift
      ;;
    *)
      log_error "未知参数：$1"
      show_help
      exit 1
      ;;
  esac
done

# 如果没有指定测试，运行所有
if $RUN_ALL; then
  TESTS_TO_RUN=(tc001 tc003 tc004 tc005)
fi

# 检查 SSH 连接（仅非本地模式）
if [ "$LOCAL_MODE" != "1" ]; then
  log_header
  log_info "检查 SSH 连接..."
  if ssh -o ConnectTimeout=5 -o BatchMode=yes "$TEST_HOST" "echo '连接成功'" 2>/dev/null; then
    log_info "SSH 连接正常 ($TEST_HOST)"
  else
    log_error "无法连接到测试服务器：$TEST_HOST"
    log_error "请检查 SSH 配置或使用 --host 参数指定正确的服务器"
    log_info "或者使用 --local 模式在本地运行（如果已在测试服务器上）"
    exit 1
  fi
  log_header
fi

# 运行测试
echo ""
for test in "${TESTS_TO_RUN[@]}"; do
  if [ "$test" == "all" ]; then
    run_test "tc001"
    run_test "tc003"
    run_test "tc004"
    run_test "tc005"
  else
    run_test "$test"
  fi
done

# 输出汇总
echo ""
log_header
log_info "测试汇总"
log_header
echo ""

printf "%-20s %s\n" "测试用例" "结果"
printf "%-20s %s\n" "--------------------" "------"
for test in "${!RESULTS[@]}"; do
  printf "%-20s %s\n" "$test" "${RESULTS[$test]}"
done

echo ""
log_info "总计：通过=$TOTAL_PASS, 失败=$TOTAL_FAIL"
echo ""

if [ $TOTAL_FAIL -eq 0 ]; then
  log_info "🎉 所有测试通过！"
  exit 0
else
  log_error "⚠️  有 $TOTAL_FAIL 个测试失败"
  exit 1
fi
