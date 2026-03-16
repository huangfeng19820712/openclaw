# OpenClaw 自动配对日志查看指南

## 日志概述

已在 `node-auto-register` 插件中添加了详细的日志信息，覆盖以下关键流程：

1. **邀请码验证** - 记录邀请码加载、验证过程
2. **配对状态更新** - 记录配对请求的获取和批准
3. **邀请码使用次数更新** - 记录使用次数的变更

## 日志前缀说明

| 日志前缀 | 来源文件 | 说明 |
|----------|----------|------|
| `[auto-pair]` | `src/auto-pair-server.js` | Control UI 自动配对服务（插件内嵌） |
| `[invite-server]` | `scripts/invite-code-server.js` | 独立邀请码验证服务 |

---

## 查看日志的方法

### 方法 1：Docker 容器日志（推荐）

如果你使用 Docker 部署，查看网关容器日志：

```bash
# 实时查看日志
docker compose logs -f openclaw-gateway

# 查看最近 100 行日志
docker compose logs --tail=100 openclaw-gateway

# 查看特定时间后的日志
docker compose logs --since="2026-03-16T10:00:00" openclaw-gateway
```

**关键日志示例：**

```
[auto-pair] === Registering auto-pair server ===
[auto-pair] Server registered at /plugins/node-auto-register/api/auto-pair
[auto-pair] === Auto-pair request received ===
[auto-pair] Method: GET
[auto-pair] URL: /plugins/node-auto-register/api/auto-pair?inviteCode=abc123...
[auto-pair] Verifying invite code: abc123...
[auto-pair] Loaded invite codes from: /home/node/.openclaw/invite-codes.json
[auto-pair] Found 3 invite code(s)
[auto-pair] Code "control-ui" validation successful
[auto-pair]   - Expires: 2027-03-16T00:00:00.000Z
[auto-pair]   - Max uses: 999
[auto-pair]   - Current uses: 0
[auto-pair] Fetching pending pairing requests...
[auto-pair] Found 1 pending pairing request(s)
[auto-pair] Approving pending request:
[auto-pair]   - requestId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
[auto-pair]   - deviceId: device-001
[auto-pair]   - displayName: Control-UI-Session
[auto-pair] Pairing approved successfully!
[auto-pair]   - deviceId: device-001
[auto-pair]   - displayName: Control-UI-Session
[auto-pair] Incrementing invite code usage for: control-ui
[auto-pair] Invite code usage updated: control-ui 0 -> 1
```

---

### 方法 2：进入容器查看实时日志

```bash
# 进入容器
docker exec -it openclaw-container bash

# 查看配置文件中的插件日志输出
# （取决于日志配置，可能在 stdout 或特定日志文件）
```

---

### 方法 3：本地开发环境

如果你在本地开发环境运行（非 Docker）：

```bash
# 日志会直接输出到运行终端
node dist/index.js gateway

# 或者使用 PM2 等进程管理器
pm2 logs openclaw-gateway
```

---

### 方法 4：独立服务模式

如果运行独立的邀请码验证服务：

```bash
# 启动服务
node plugins/node-auto-register/scripts/invite-code-server.js

# 日志会直接输出到终端
```

**关键日志示例：**

```
============================================================
OpenClaw Invite Code Verification Server
============================================================
Invite code file: /home/user/.openclaw/invite-codes.json
Server running on http://localhost:18795

Endpoints:
  GET  /health  - Health check
  GET  /codes   - List invite codes
  POST /verify  - Verify and approve
============================================================

[invite-server] === Request received ===
[invite-server] Method: POST
[invite-server] Path: /verify
[invite-server] Request body: {"inviteCode":"abc123","nodeId":"node-001",...}
[invite-server] Parameters:
[invite-server]   - inviteCode: abc123...
[invite-server]   - nodeId: node-001
[invite-server]   - gatewayUrl: http://localhost:18789
[invite-server] Verifying invite code: abc123...
[invite-server] Loaded invite codes from: /home/user/.openclaw/invite-codes.json
[invite-server] Code "my-node" validation successful
[invite-server] Starting node pairing approval...
[invite-server] Approving node pairing via gateway: http://localhost:18789
[invite-server] Pairing approval result: {...}
```

---

## 日志排查流程

### 问题 1：邀请码验证失败

**查找日志关键字：**
```bash
docker compose logs openclaw-gateway 2>&1 | grep -i "invite code"
```

**可能的错误信息：**
- `Invite code validation failed: invite code is required` - 缺少 inviteCode 参数
- `Invite code validation failed: expired` - 邀请码已过期
- `Invite code validation failed: max_uses_reached` - 达到最大使用次数
- `No matching valid invite code found` - 邀请码不存在

---

### 问题 2：配对请求失败

**查找日志关键字：**
```bash
docker compose logs openclaw-gateway 2>&1 | grep -i "pairing"
```

**可能的错误信息：**
- `Found 0 pending pairing request(s)` - 没有待处理的配对请求
- `device-pairing functions not available` - 设备配对功能不可用
- `Failed to approve pairing` - 批准配对失败

---

### 问题 3：插件未加载

**查找日志关键字：**
```bash
docker compose logs openclaw-gateway 2>&1 | grep -i "auto-pair"
```

**正常加载日志：**
```
[auto-pair] === Registering auto-pair server ===
[auto-pair] Server registered at /plugins/node-auto-register/api/auto-pair
```

**如果没有日志输出，说明插件未加载，检查：**
1. 插件路径是否在 `plugins.load.paths` 中
2. 插件是否被 `plugins.allow` 允许
3. 插件配置是否启用

---

## 配置文件位置

| 文件 | 路径 | 说明 |
|------|------|------|
| 邀请码文件 | `~/.openclaw/invite-codes.json` | 存储所有邀请码及使用记录 |
| 配对状态文件 | `~/.openclaw/pairing/devices.json` | 设备配对状态 |
| 配对状态文件 | `~/.openclaw/pairing/nodes.json` | 节点配对状态 |
| OpenClaw 配置 | `~/.openclaw/openclaw.json` | 主配置文件 |

---

## 调试技巧

### 1. 测试自动配对 API

```bash
# 直接在容器内测试
docker exec -it openclaw-container bash
curl -X GET "http://localhost:18789/plugins/node-auto-register/api/auto-pair?inviteCode=YOUR_CODE"

# 从外部测试（确保端口暴露）
curl -X GET "http://localhost:18789/plugins/node-auto-register/api/auto-pair?inviteCode=YOUR_CODE"
```

### 2. 查看邀请码文件

```bash
docker exec -it openclaw-container cat /home/node/.openclaw/invite-codes.json
```

### 3. 查看配对状态

```bash
# 查看已配对的设备
docker exec -it openclaw-container cat /home/node/.openclaw/pairing/devices.json

# 使用 CLI 查看
docker compose run --rm openclaw-cli devices list
```

### 4. 日志过滤技巧

```bash
# 只看 auto-pair 相关日志
docker compose logs openclaw-gateway 2>&1 | grep "\[auto-pair\]"

# 查看错误日志
docker compose logs openclaw-gateway 2>&1 | grep -i "error\|failed"

# 导出日志到文件分析
docker compose logs openclaw-gateway > gateway.log
```

---

## 日志级别说明

当前实现的日志级别：

| 级别 | 说明 | 输出位置 |
|------|------|----------|
| `console.log()` | 信息性日志 | stdout |
| `console.warn()` | 警告日志 | stderr |
| `console.error()` | 错误日志 | stderr |

如需调整日志级别，可修改：
- `src/auto-pair-server.js`
- `scripts/invite-code-server.js`
- `src/inject-auto-pair.js`（前端脚本，日志在浏览器控制台）

---

## 前端日志

自动配对脚本在浏览器中运行时，日志会输出到**浏览器开发者工具控制台**。

**查看方法：**

1. 打开 Control UI 页面
2. 按 `F12` 打开开发者工具
3. 切换到 **Console** 标签
4. 查找 `[openclaw-auto-pair]` 前缀的日志

**前端日志示例：**
```
[openclaw-auto-pair] Invite code detected, starting auto-pair...
[openclaw-auto-pair] Device paired successfully: device-001
[openclaw-auto-pair] Refreshing page...
```
