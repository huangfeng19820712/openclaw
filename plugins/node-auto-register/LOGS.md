# OpenClaw 自动配对日志查看指南

## 日志概述

已在 `node-auto-register` 插件中添加了详细的日志信息，覆盖以下关键流程：

1. **插件启动** - 记录脚本注入和 HTTP 路由注册
2. **邀请码验证** - 记录邀请码加载、验证过程
3. **配对状态更新** - 记录配对请求的获取和批准
4. **邀请码使用次数更新** - 记录使用次数的变更

## 日志前缀说明

| 日志前缀 | 来源文件 | 说明 |
|----------|----------|------|
| `[node-auto-register]` | `src/index.js` | 插件主日志（启动、注入脚本） |
| `[auto-pair]` | `src/auto-pair-server.js` | Control UI 自动配对服务（插件内嵌） |
| `[invite-server]` | `scripts/invite-code-server.js` | 独立邀请码验证服务 |
| `[openclaw-auto-pair]` | `src/inject-auto-pair.js` | 前端自动配对脚本（浏览器控制台） |

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

# 只看插件启动和注入日志
docker compose logs openclaw-gateway 2>&1 | grep "\[node-auto-register\]"

# 只看自动配对请求日志
docker compose logs openclaw-gateway 2>&1 | grep "\[auto-pair\]"
```

**正常启动日志示例：**

```
[node-auto-register] Plugin loaded
[node-auto-register] Attempting to inject auto-pair script to Control UI...
[node-auto-register] Found Control UI index.html at: /app/dist/control-ui/index.html
[node-auto-register] Auto-pair script already injected
[node-auto-register] Auto-pair service registered
[auto-pair] === Registering auto-pair server ===
[auto-pair] Server registered at /plugins/node-auto-register/api/auto-pair
[auto-pair] Endpoint URL: http://<gateway-host>:<gateway-port>/plugins/node-auto-register/api/auto-pair
[auto-pair] === Auto-pair server registration complete ===
```

**如果找不到 Control UI 的日志：**

```
[node-auto-register] Plugin loaded
[node-auto-register] Attempting to inject auto-pair script to Control UI...
[node-auto-register] Could not find Control UI index.html - auto-pair script will not be injected
[node-auto-register] Searched paths:
[node-auto-register]   - /app/dist/control-ui/index.html
[node-auto-register]   - /app/dist/ui/index.html
[node-auto-register]   - /home/node/.openclaw/ui/index.html
[node-auto-register] To fix: run the following command:
[node-auto-register]   node /home/node/.openclaw/workspace/plugins/node-auto-register/scripts/inject-auto-pair-script.js inject
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

---

## 快速问题排查

### 问题 1：页面提示 "pairing required"

**症状：** 访问 `http://host:port/control-ui/?inviteCode=xxx` 后提示 `pairing required`

**可能原因：** 自动配对脚本没有被注入到 Control UI 页面

**检查日志：**
```bash
docker compose logs openclaw-gateway 2>&1 | grep "\[node-auto-register\]"
```

**如果没有看到注入成功日志，手动注入：**
```bash
# 进入容器执行注入
docker exec -it openclaw-container \
  node /home/node/.openclaw/workspace/plugins/node-auto-register/scripts/inject-auto-pair-script.js inject

# 然后重启网关容器
docker compose restart openclaw-gateway

# 或者直接刷新页面（如果脚本已注入则无需重启）
```

**验证注入是否成功：**
```bash
# 查看 Control UI index.html 是否包含自动配对脚本
docker exec -it openclaw-container \
  grep -l "openclaw-auto-pair" /app/dist/control-ui/index.html || \
  grep -l "OPENCLAW_AUTO_PAIR_EXECUTED" /app/dist/control-ui/index.html
```

---

### 问题 2：插件加载但服务未注册

**症状：** 日志显示 `Plugin loaded` 但没有 `Server registered` 日志

**检查日志：**
```bash
docker compose logs openclaw-gateway 2>&1 | grep "\[auto-pair\]"
```

**可能原因：**
1. 插件路径配置错误
2. 插件被禁用

**解决方法：**
```bash
# 检查插件配置
docker exec -it openclaw-container \
  cat /home/node/.openclaw/openclaw.json | grep -A 10 '"plugins"'

# 确保插件路径在 load.paths 中
docker exec -it openclaw-container \
  node -e "const c=JSON.parse(require('fs').readFileSync('/home/node/.openclaw/openclaw.json')); console.log(JSON.stringify(c.plugins?.load?.paths, null, 2))"
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
