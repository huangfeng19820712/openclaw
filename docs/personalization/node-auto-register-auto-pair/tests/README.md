# Node Auto-Register 自动化测试套件

## 目录结构

```
tests/
├── run-all-tests.sh          # 主入口脚本
├── tc001-port-offset.sh      # TC-001: 端口偏移配置测试
├── tc003-one-shot-pair.sh    # TC-003: 一键配对 API 测试
├── tc004-invite-code.sh      # TC-004: 邀请码验证测试
├── tc005-state-files.sh      # TC-005: 配对状态文件测试
└── README.md                 # 本文档
```

## 快速开始

### 前置条件

1. **SSH 访问测试服务器**
   ```bash
   ssh root@192.168.90.6  # 确保可以无密码登录或已配置 SSH 密钥
   ```

2. **测试服务器上运行 OpenClaw**
   - Docker 容器 `openclaw-gw1-openclaw-gateway-1` 正在运行
   - node-auto-register 插件已加载

### 运行所有测试

```bash
cd docs/personalization/node-auto-register-auto-pair/tests
./run-all-tests.sh
```

### 运行单个测试

```bash
# 端口偏移测试
./run-all-tests.sh tc001

# 一键配对 API 测试
./run-all-tests.sh tc003

# 邀请码验证测试
./run-all-tests.sh tc004

# 配对状态文件测试
./run-all-tests.sh tc005
```

### 自定义参数

```bash
# 指定测试服务器
./run-all-tests.sh --host user@your-server.com

# 指定端口
./run-all-tests.sh --port 18889

# 跳过并发测试（加快速度）
./run-all-tests.sh --skip-concurrent

# 组合使用
./run-all-tests.sh --host user@server --port 18889 --skip-concurrent
```

## 测试用例说明

### TC-001: 端口偏移配置测试

验证 `generate-control-ui-invite-code.js` 脚本正确读取 `OPENCLAW_PORT_OFFSET` 环境变量。

| 子测试 | 描述 | 预期 |
|--------|------|------|
| 无偏移 | 不设置环境变量 | 端口 18789 |
| 偏移 100 | OPENCLAW_PORT_OFFSET=100 | 端口 18889 |
| 偏移 200 | OPENCLAW_PORT_OFFSET=200 | 端口 18989 |
| URL 格式 | 包含 inviteCode 和 session 参数 | 格式正确 |

### TC-003: 一键配对 API 测试

验证 `/plugins/node-auto-register/api/one-shot-pair` API 的各项功能。

| 子测试 | 描述 | 预期响应 |
|--------|------|----------|
| 有效邀请码 | 正常配对请求 | `{"ok":true,"paired":true,...}` |
| 无效邀请码 | 不存在的邀请码 | `{"ok":false,"error":"invalid or expired..."}` |
| 缺失参数 | 无 inviteCode 参数 | `{"ok":false,"error":"inviteCode is required"}` |
| 空邀请码 | inviteCode=空字符串 | `{"ok":false,...}` |
| 状态文件 | 验证 paired.json | 包含设备记录 |

### TC-004: 邀请码验证测试

验证邀请码的生成、验证、管理功能。

| 子测试 | 描述 |
|--------|------|
| 生成邀请码 | 调用 generate 脚本 |
| 文件格式 | invite-codes.json 有效 JSON |
| 字段验证 | code, expiresAt, maxUses, usedCount, active |
| 查看列表 | manage-invite-codes.js list |
| 撤销邀请码 | revoke 命令 |
| 已撤销验证 | API 拒绝已撤销的邀请码 |
| 清理过期 | cleanup 命令 |

### TC-005: 配对状态文件测试

验证设备配对状态文件的正确管理。

| 子测试 | 描述 |
|--------|------|
| 清理状态 | 删除现有状态文件 |
| 创建配对 | 调用一键配对 API |
| 目录结构 | devices/ 目录自动创建 |
| pending.json | 文件格式验证 |
| paired.json | 包含 deviceId, tokens 等 |
| 并发写入 | 5 个并发请求不损坏文件 |

## 输出示例

```
=============================================
 TC-003: 一键配对 API 测试
=============================================

[INFO] 步骤 1: 生成测试邀请码...
[INFO] 邀请码：abc123xyz...

[INFO] 步骤 2: 测试有效邀请码...
响应：{"ok":true,"paired":true,"deviceId":"auto-pair-..."}
✅ PASS: 有效邀请码返回 ok:true
✅ PASS: 有效邀请码返回 paired:true
...

=============================================
 测试结果统计
=============================================
[INFO] 通过：10
[ERROR] 失败：0

🎉 所有测试通过！
```

## 故障排查

### SSH 连接失败

```bash
# 测试 SSH 连接
ssh -o ConnectTimeout=5 root@192.168.90.6 "echo test"

# 如果需要密码，配置 SSH 密钥
ssh-copy-id root@192.168.90.6
```

### 容器未运行

```bash
# 在测试服务器上检查容器状态
ssh root@192.168.90.6 "docker ps | grep openclaw"

# 如果未运行，重新部署
ssh root@192.168.90.6 "cd /data/workspace/openclaw && ./docker-instance-setup.sh"
```

### 插件未加载

```bash
# 查看容器日志
ssh root@192.168.90.6 "docker logs openclaw-gw1-openclaw-gateway-1 | grep node-auto-register"

# 应该看到:
# [node-auto-register] Plugin loaded
# [one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair
```

### 端口不可访问

```bash
# 在测试服务器上测试
ssh root@192.168.90.6 "curl -s http://127.0.0.1:18889/ | head -5"

# 检查端口映射
ssh root@192.168.90.6 "docker port openclaw-gw1-openclaw-gateway-1"
```

## 扩展测试

### 添加新测试用例

1. 在 `tests/` 目录创建新的 `.sh` 文件
2. 遵循现有测试脚本的模板
3. 在 `run-all-tests.sh` 中添加测试名称

### 示例模板

```bash
#!/bin/bash
#
# 新测试用例模板
#

set -e

SSH_HOST="${SSH_HOST:-root@192.168.90.6}"
PORT="${PORT:-18889}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

PASS=0
FAIL=0

echo "=============================================="
echo " 测试名称"
echo "=============================================="

# 测试步骤...

echo "通过：$PASS, 失败：$FAIL"
```

## 测试报告

测试完成后，结果会汇总显示。可以重定向输出到文件：

```bash
./run-all-tests.sh > test-result-$(date +%Y%m%d-%H%M%S).log 2>&1
```

## 与 Playwright E2E 测试配合

本测试套件是纯 API 测试方案。如果需要测试浏览器行为（如 TC-002、TC-006），请使用 Playwright：

```bash
# 未来扩展
./run-all-tests.sh --with-e2e  # 需要 Playwright
```

## 常用命令参考

```bash
# 生成邀请码
ssh root@192.168.90.6 "OPENCLAW_PORT_OFFSET=100 node /data/workspace/openclaw/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test"

# 查看邀请码列表
ssh root@192.168.90.6 "node /data/workspace/openclaw/plugins/node-auto-register/scripts/manage-invite-codes.js list"

# 测试 API
ssh root@192.168.90.6 "curl -s 'http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx'"

# 查看配对状态
ssh root@192.168.90.6 "cat /home/node/.openclaw/devices/paired.json"

# 查看容器日志
ssh root@192.168.90.6 "docker logs openclaw-gw1-openclaw-gateway-1 --tail 50"
```
