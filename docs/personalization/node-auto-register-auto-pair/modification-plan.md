# Control UI 自动配对功能修改方案

## 修改项概览

| 修改项 | 文件 | 修改类型 | 状态 | 优先级 |
|--------|------|----------|------|--------|
| MC-001 | `scripts/generate-control-ui-invite-code.js` | 支持端口偏移 | ✅ 已完成 | P0 |
| MC-002 | `src/one-shot-pair-server.js` | 修复文件路径 | ✅ 已完成 | P0 |
| MC-003 | `src/inject-auto-pair.js` | 确保正确注入 | ✅ 已完成 | P0 |
| MC-004 | `src/index.js` | 确保服务注册 | ✅ 已完成 | P0 |
| MC-005 | `src/index.js` | 修复 CSP 问题（外部脚本引用） | ✅ 已完成 | P0 |
| MC-006 | `docker-instance-setup.sh` | 传递 PORT_OFFSET 环境变量 | ✅ 已完成 | P0 |
| MC-007 | `scripts/quick-redeploy-plugin.sh` | 快速重新部署脚本 | ✅ 已完成 | P1 |
| MC-008 | `sh/redeploy.sh` | 替换邀请码占位符 `<CODE>` 为实际值 | ✅ 已完成 | P1 |
| MC-009 | `docker-instance-setup.sh` | 修复容器内代码不同步问题（git pull 后） | ✅ 已完成 | P0 |
| MC-010 | `src/index.js` | 修复 auth: 'none' 为 auth: 'plugin' | ✅ 已完成 | P0 |
| MC-011 | `sh/redeploy.sh` | 修复 workspace 路径同步问题 | ✅ 已完成 | P0 |
| MC-012 | `src/inject-auto-pair.js` | 修复 localStorage 数据格式（添加 role 和 updatedAtMs） | ✅ 已完成 | P0 |

---

## MC-001: 邀请码生成脚本支持端口偏移

**文件：** `plugins/node-auto-register/scripts/generate-control-ui-invite-code.js`

**问题描述：**
- 脚本硬编码基础端口为 18789
- 未读取 `OPENCLAW_PORT_OFFSET` 环境变量
- 多实例部署时（如 PORT_OFFSET=100），生成的 URL 端口错误
  - 错误：`http://127.0.0.1:18789/...`
  - 正确：`http://127.0.0.1:18889/...`

**修改方案：**

### 步骤 1：添加端口计算逻辑

在生成 URL 的函数中添加端口偏移计算：

```javascript
function generateControlUiUrl(inviteCode, gatewayPort) {
  // 读取环境变量配置
  const portOffset = parseInt(process.env.OPENCLAW_PORT_OFFSET || '0', 10);
  const basePort = gatewayPort || 18789;
  const port = basePort + portOffset;

  return `http://127.0.0.1:${port}/control-ui/?inviteCode=${inviteCode}&session=main`;
}
```

### 步骤 2：更新默认端口读取

在脚本主逻辑中，同样应用端口偏移：

```javascript
// 修改前
const gatewayPort = process.env.OPENCLAW_GATEWAY_PORT || 18789;

// 修改后
const portOffset = parseInt(process.env.OPENCLAW_PORT_OFFSET || '0', 10);
const basePort = process.env.OPENCLAW_GATEWAY_PORT || 18789;
const gatewayPort = basePort + portOffset;
```

### 步骤 3：添加说明日志

在输出邀请码时，同时输出端口偏移信息：

```javascript
console.log('='.repeat(70));
console.log('OpenClaw Control UI Invite Code Generated');
console.log('='.repeat(70));
console.log(`Code Name:    ${codeName}`);
console.log(`Invite Code:  ${inviteCode}`);
console.log(`Port Offset:  ${portOffset === 0 ? 'None' : '+' + portOffset}`);
console.log(`Gateway Port: ${gatewayPort}`);
console.log(`Expires:      ${new Date(codes[codeName].expiresAt).toISOString()}`);
console.log(`Max Uses:     ${maxUses}`);
console.log('='.repeat(70));
```

**验收测试：**

```bash
# 测试 1：无偏移
OPENCLAW_PORT_OFFSET= node scripts/generate-control-ui-invite-code.js test
# 期望：端口 18789

# 测试 2：偏移 100
OPENCLAW_PORT_OFFSET=100 node scripts/generate-control-ui-invite-code.js test
# 期望：端口 18889

# 测试 3：偏移 200
OPENCLAW_PORT_OFFSET=200 node scripts/generate-control-ui-invite-code.js test
# 期望：端口 18989
```

**当前状态：** ✅ 已完成

---

## MC-002: 修复 one-shot-pair-server.js 文件路径

**文件：** `plugins/node-auto-register/src/one-shot-pair-server.js`

**问题描述：**
- OpenClaw 核心使用两个独立文件存储配对状态
  - `devices/pending.json` - 待处理的配对请求
  - `devices/paired.json` - 已配对的设备
- 原代码可能使用了错误的文件路径

**修改方案：**

### 已完成的修改

1. **新增 `getDevicePairingPaths()` 函数**
2. **新增 `loadPendingRequests()` 函数**
3. **新增 `savePendingRequests()` 函数（原子写入）**
4. **新增 `createPairingRequest()` 函数**
5. **修复 `handleOneShotPair()` 中的 `approveDevicePairing` 调用**（添加 `baseDir` 参数）

**验收测试：**

```bash
# 测试 API 调用
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<CODE>" | jq .

# 验证文件路径
cat ~/.openclaw/devices/pending.json | jq .
cat ~/.openclaw/devices/paired.json | jq .
```

**当前状态：** ✅ 已完成

---

## MC-003: 确保 inject-auto-pair.js 正确注入

**文件：** `plugins/node-auto-register/src/inject-auto-pair.js`

**功能描述：**
- 检测 URL 中的 `inviteCode` 参数
- 调用一键配对 API
- 保存设备 token 到 localStorage
- 自动刷新页面

**当前状态：** ✅ 已完成

---

## MC-004: 确保服务注册

**文件：** `plugins/node-auto-register/src/index.js`

**功能描述：**
- 加载插件时注册一键配对 HTTP 路由
- 注入自动配对脚本到 Control UI 页面

**当前状态：** ✅ 已完成

---

## MC-005: 修复 CSP 问题 - 使用外部脚本引用

**文件：** `plugins/node-auto-register/src/index.js`、`plugins/node-auto-register/scripts/inject-auto-pair-script.js`

**问题描述：**

当访问 `http://127.0.0.1:18889/control-ui/?inviteCode=xxx&session=main` 时，浏览器控制台显示：

```
Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self'".
http://127.0.0.1:18889/control-ui/auto-pair.js net::ERR_ABORTED 404 (Not Found)
```

**根本原因：**
- 原实现将 `inject-auto-pair.js` 的内容作为**内联脚本**注入到 HTML 的 `<head>` 中
- Control UI 页面有 CSP（Content Security Policy）保护，只允许加载来自 `'self'` 的外部脚本文件
- 内联脚本被 CSP 阻止执行
- 尝试使用 `<script src="auto-pair.js">` 时，文件不存在于 Control UI 目录，返回 404

**修改方案：**

### 已完成的修改

#### 步骤 1：修改 `index.js` - 使用插件 HTTP 路由提供脚本

不再复制文件到 Control UI 目录，而是通过插件的 HTTP 路由提供脚本：

```javascript
/**
 * 注册自动配对脚本的静态资源路由
 * 提供 /plugins/node-auto-register/static/auto-pair.js 端点
 */
function registerAutoPairScriptRoute(api) {
  const scriptContent = getAutoPairScript();

  api.registerHttpRoute({
    path: '/plugins/node-auto-register/static/auto-pair.js',
    auth: 'none',
    handler: (req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.end(scriptContent);
    },
    match: 'exact',
  });
}
```

#### 步骤 2：修改 HTML 注入逻辑

在 `index.html` 中引用插件提供的 URL：

```javascript
function injectAutoPairScriptToControlUi() {
  // ... 查找 index.html 路径 ...

  // 在 </head> 之前注入外部脚本引用（使用插件提供的 URL）
  const scriptTag = '<script src="/plugins/node-auto-register/static/auto-pair.js"></script>\n';
  const injectedHtml = html.replace('</head>', scriptTag + '</head>');
  fs.writeFileSync(indexPath, injectedHtml, 'utf-8');
}
```

#### 步骤 3：修改 `inject-auto-pair-script.js` 工具

同样使用插件 URL 进行注入：

```javascript
function injectScript(indexPath, scriptContent) {
  // 在 </head> 之前注入外部脚本引用（使用插件提供的 URL）
  const scriptTag = '<script src="/plugins/node-auto-register/static/auto-pair.js"></script>\n';
  const injectedHtml = html.replace('</head>', scriptTag + '</head>');
  fs.writeFileSync(indexPath, injectedHtml, 'utf-8');
}
```

**优势：**
- 不需要复制文件到 Control UI 目录
- 不需要管理文件的生命周期
- 脚本内容始终与插件同步更新
- 适用于 Docker 容器等环境

**验收测试：**

1. 访问 `http://127.0.0.1:18889/control-ui/?inviteCode=xxx&session=main`
2. 打开浏览器开发者工具 Console
3. 确认没有 CSP 错误
4. 确认 `[openclaw-auto-pair]` 日志正常输出
5. 确认 Network 面板中 `/plugins/node-auto-register/static/auto-pair.js` 成功加载（HTTP 200，Content-Type: application/javascript）
6. 确认配对完成后页面自动刷新
7. 确认刷新后 localStorage 中包含设备 token

**当前状态：** ✅ 已完成

---

## 测试验证流程

### 完整测试流程

```bash
# 1. 生成邀请码（测试端口偏移）
OPENCLAW_PORT_OFFSET=100 node scripts/generate-control-ui-invite-code.js test

# 记录输出的 URL，例如：
# http://127.0.0.1:18889/control-ui/?inviteCode=xxx&session=main

# 2. 直接测试 API
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<CODE>" | jq .

# 期望输出：
# {
#   "ok": true,
#   "paired": true,
#   "deviceId": "auto-pair-...",
#   "deviceToken": "eyJ...",
#   "role": "operator"
# }

# 3. 验证配对状态文件
cat ~/.openclaw/devices/paired.json | jq .

# 4. 浏览器测试
# 访问生成的 URL，观察自动配对流程
```

### 预期结果

| 测试项 | 预期 | 实际 |
|--------|------|------|
| 生成 URL 端口正确 | 18889 | |
| API 返回成功 | ok: true | |
| API 返回 deviceToken | JWT 格式 | |
| paired.json 包含设备 | 有效 JSON | |
| 浏览器自动配对 | Console 有日志 | |
| localStorage 保存 token | openclaw.device.auth.v1 | |
| 页面自动刷新 | 配对完成后刷新 | |
| 无 CSP 错误 | Console 无报错 | |

---

## 修改日志

| 日期 | 修改项 | 说明 | 状态 |
|------|--------|------|------|
| 2026-03-20 | MC-009 | 修复容器内代码不同步问题（git pull 后 workspace 代码同步到 `/app/`） | ✅ |
| 2026-03-20 | MC-008 | 修复 `sh/redeploy.sh` 中邀请码占位符 `<CODE>` 为实际生成的邀请码 | ✅ |
| 2026-03-20 | MC-007 | 创建快速重新部署脚本 `quick-redeploy-plugin.sh` | ✅ |
| 2026-03-20 | MC-006 | 修复 `docker-instance-setup.sh` 中邀请码生成命令缺少 `OPENCLAW_PORT_OFFSET` 环境变量 | ✅ |
| 2026-03-20 | MC-005 | 修复 CSP 问题，改用插件 HTTP 路由提供脚本（`/plugins/node-auto-register/static/auto-pair.js`） | ✅ |
| 2026-03-19 | MC-001 | 添加 `OPENCLAW_PORT_OFFSET` 环境变量支持，修正端口计算逻辑 | ✅ |
| 2026-03-19 | MC-002 | 修复 `one-shot-pair-server.js` 文件路径和 `approveDevicePairing` 参数 | ✅ |
| 2026-03-19 | MC-003 | 确保 `inject-auto-pair.js` 正确注入 | ✅ |
| 2026-03-19 | MC-004 | 确保服务注册 | ✅ |

---

## MC-006: 修复 docker-instance-setup.sh 中 PORT_OFFSET 传递

**文件：** `docker-instance-setup.sh`

**问题描述：**
- 脚本第 970 行调用 `generate-control-ui-invite-code.js` 时没有传递 `OPENCLAW_PORT_OFFSET` 环境变量
- 导致容器内生成的 URL 端口始终是 18789，而不是正确的偏移端口（如 18889）

**修改方案：**

在 `docker compose run` 命令中添加 `-e OPENCLAW_PORT_OFFSET=$PORT_OFFSET`：

```bash
# 修改前
CONTROL_UI_INVITE_OUTPUT="$(${COMPOSE_HINT} run --rm --entrypoint node openclaw-gateway ...)"

# 修改后
CONTROL_UI_INVITE_OUTPUT="$(${COMPOSE_HINT} run --rm --entrypoint node -e OPENCLAW_PORT_OFFSET=$PORT_OFFSET openclaw-gateway ...)"
```

**当前状态：** ✅ 已完成

---

## MC-007: 创建快速重新部署脚本

**文件：** `plugins/node-auto-register/scripts/quick-redeploy-plugin.sh`

**功能描述：**
- 快速更新容器内的插件代码（无需重新运行完整的 docker-setup.sh）
- 自动复制插件文件到容器
- 自动重启 gateway 容器
- 自动注入 auto-pair 脚本
- 自动生成新的邀请码（带正确端口偏移）

**使用方式：**

```bash
# 默认实例
./plugins/node-auto-register/scripts/quick-redeploy-plugin.sh

# 指定实例
./plugins/node-auto-register/scripts/quick-redeploy-plugin.sh gw1
```

**当前状态：** ✅ 已完成

---

## MC-008: 修复 sh/redeploy.sh 中邀请码占位符

**文件：** `plugins/node-auto-register/sh/redeploy.sh`

**问题描述：**
- 脚本第 180 行输出的访问 URL 中使用占位符 `<CODE>`，而不是实际的邀请码
- 用户需要手动替换 `<CODE>` 才能访问，体验不佳

**修改方案：**

在脚本末尾添加自动生成邀请码的逻辑：

```bash
# 生成 Control UI 邀请码
log_info "生成 Control UI 邀请码..."
GATEWAY_PORT=$((18789 + PORT_OFFSET))
INVITE_OUTPUT="$(docker exec $CONTAINER_NAME node .../generate-control-ui-invite-code.js redeploy-$(date +%s) 2>&1 || true)"

INVITE_CODE=""
if echo "$INVITE_OUTPUT" | grep -q "Invite Code:"; then
  INVITE_CODE="$(echo "$INVITE_OUTPUT" | grep "Invite Code:" | awk '{print $3}')"
fi

if [ -n "$INVITE_CODE" ]; then
  log_info "访问 URL:"
  echo "  http://127.0.0.1:${GATEWAY_PORT}/control-ui/?inviteCode=${INVITE_CODE}&session=main"
else
  log_warn "无法生成邀请码，使用占位符"
  echo "  http://127.0.0.1:${GATEWAY_PORT}/control-ui/?inviteCode=<CODE>&session=main"
fi
```

**优势：**
- 用户无需手动替换邀请码
- 自动使用正确的端口偏移
- 提供完整可直接访问的 URL

**当前状态：** ✅ 已完成

---

## MC-009: 修复容器内代码不同步问题

**文件：** `docker-instance-setup.sh`

**问题描述：**

部署流程为：
1. 本地 git 提交 → 服务器 `git pull` → 代码更新到 `/data/workspace/openclaw/`
2. 删除旧容器 → 创建新容器

问题：
- 宿主机的 `/data/workspace/openclaw/` 通过 git pull 更新了 ✅
- 但容器内 `/app/` 目录来自**镜像构建时的旧代码** ❌
- 容器重启后，`/app/dist/control-ui/index.html` 中注入的脚本会丢失

**根本原因：**
- `/app/` = 镜像内目录（只读，构建时固定）
- `/home/node/.openclaw/workspace/` = 宿主机绑定挂载（git pull 后更新）
- 插件代码在 workspace 中是最新的，但 `/app/` 目录不会更新

**修改方案：**

在 `docker-instance-setup.sh` 中添加代码同步步骤：

```bash
# 0. 复制插件到 workspace 目录（总是执行，确保 git pull 后的代码同步到容器）
PLUGIN_WORKSPACE_DIR="$OPENCLAW_WORKSPACE_DIR/plugins/node-auto-register"
PLUGIN_CONTAINER_DIR="/app/dist/plugins/node-auto-register"

echo "    Syncing plugin from workspace to container..."
# 从 workspace 复制最新代码到容器内的 /app 目录
docker exec $(${COMPOSE_HINT} ps -q openclaw-gateway) sh -c \
  "mkdir -p $PLUGIN_CONTAINER_DIR && cp -r /home/node/.openclaw/workspace/plugins/node-auto-register/. $PLUGIN_CONTAINER_DIR/" || true

# 0.5 配置插件加载路径
${COMPOSE_HINT} run --rm --entrypoint node openclaw-gateway -e "
const fs = require('fs');
const configPath = '/home/node/.openclaw/openclaw.json';
let config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
if (!config.plugins) config.plugins = {};
if (!config.plugins.load) config.plugins.load = {};
if (!Array.isArray(config.plugins.load.paths)) config.plugins.load.paths = [];
const pluginPath = '/app/dist/plugins/node-auto-register';
if (!config.plugins.load.paths.includes(pluginPath)) {
  config.plugins.load.paths.push(pluginPath);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Plugin path configured:', pluginPath);
}
" 2>&1 || true

# 2. 注入自动配对脚本到 Control UI（每次启动时重新注入）
docker exec $(${COMPOSE_HINT} ps -q openclaw-gateway) \
  node /app/dist/plugins/node-auto-register/scripts/inject-auto-pair-script.js inject
```

**优势：**
- 每次部署时，workspace 中的最新代码自动同步到容器内 `/app/` 目录
- `index.html` 每次启动时重新注入，确保脚本不丢失
- 插件路径配置为 `/app/dist/plugins/node-auto-register`，统一使用容器内路径

**当前状态：** ✅ 已完成

---

## MC-010: 修复 auth: 'none' 无效配置

**文件：** `plugins/node-auto-register/src/index.js`

**问题描述：**
- 插件 HTTP 路由注册时使用了 `auth: 'none'` 配置
- 但 OpenClaw Plugin SDK 只支持 `auth: 'gateway'` 或 `auth: 'plugin'`
- `auth: 'none'` 是无效配置，会导致路由注册失败（返回 error diagnostic）

**类型定义（src/plugins/types.ts:205）：**
```typescript
export type OpenClawPluginHttpRouteAuth = "gateway" | "plugin";
```

**验证逻辑（src/plugins/registry.ts:329-337）：**
```typescript
if (params.auth !== "gateway" && params.auth !== "plugin") {
  pushDiagnostic({
    level: "error",
    pluginId: record.id,
    source: record.source,
    message: `http route registration missing or invalid auth: ${normalizedPath}`,
  });
  return;  // 路由注册失败
}
```

**两种 auth 模式的区别：**

| auth 模式 | 认证要求 | 适用场景 |
|-----------|----------|----------|
| `auth: 'gateway'` | 需要有效的 gateway token | 受保护的管理 API、设备配对 API |
| `auth: 'plugin'` | 不需要 gateway token | 公开资源、静态文件、Control UI 脚本 |

**修改方案：**

```javascript
// 修改前
api.registerHttpRoute({
  path: '/plugins/node-auto-register/static/auto-pair.js',
  auth: 'none',  // ❌ 无效配置
  ...
});

// 修改后
api.registerHttpRoute({
  path: '/plugins/node-auto-register/static/auto-pair.js',
  auth: 'plugin',  // ✅ 正确配置
  ...
});
```

**选择 `auth: 'plugin'` 的原因：**
1. Control UI 页面访问脚本时没有 gateway token
2. 脚本本身是公开的 JavaScript 文件，不需要保护
3. `/plugins/...` 路径不在受保护前缀列表（只有 `/api/channels` 受保护）
4. `auth: 'plugin'` 允许 plugin 自己处理认证（或不处理）

**当前状态：** ✅ 已完成

---

## MC-011: 修复 redeploy.sh 中 workspace 路径同步问题

**文件：** `plugins/node-auto-register/sh/redeploy.sh`

**问题描述：**

`redeploy.sh` 中定义的工作目录：
```bash
WORKSPACE_DIR="/data/workspace/openclaw"  # 硬编码
```

但 `docker-instance-setup.sh` 挂载的是实例目录：
```bash
OPENCLAW_INSTANCE_BASE_DIR="/data/openclaw/openclaw_instances/"
OPENCLAW_WORKSPACE_DIR="${OPENCLAW_INSTANCE_BASE_DIR}${INSTANCE_ID}/workspace/"
# 默认实例 (gw1): /data/openclaw/openclaw_instances/gw1/workspace/
```

**Docker 挂载关系：**
```
宿主机                                    容器内
─────────────────────────────────────────────────────────
/data/openclaw/openclaw_instances/gw1/workspace/  →  /home/node/.openclaw/workspace/
```

**问题分析：**
- 代码更新在：`/data/workspace/openclaw`
- 容器挂载的是：`/data/openclaw/openclaw_instances/gw1/workspace/`
- 这两个是**不同的目录**，没有自动同步机制

**修改方案：**

在 `redeploy.sh` 的"清理容器"步骤之后、"重新部署"步骤之前添加同步代码：

```bash
# 同步插件代码到实例 workspace 目录
log_header
log_info "步骤 1.5: 同步插件代码到实例 workspace..."
log_header

INSTANCE_WORKSPACE_DIR="${INSTANCE_BASE_DIR}${INSTANCE_ID}/workspace"
log_info "源目录：$WORKSPACE_DIR"
log_info "目标目录：$INSTANCE_WORKSPACE_DIR"

mkdir -p "$INSTANCE_WORKSPACE_DIR/plugins"
cp -r "$WORKSPACE_DIR/plugins/node-auto-register" "$INSTANCE_WORKSPACE_DIR/plugins/"
log_info "插件代码同步完成"
```

**同步流程：**
1. 用户在 `/data/workspace/openclaw` 执行 `git pull` 更新代码
2. `redeploy.sh` 将插件代码从 `/data/workspace/openclaw/plugins/node-auto-register` 复制到 `/data/openclaw/openclaw_instances/gw1/workspace/plugins/node-auto-register`
3. `docker-instance-setup.sh` 通过绑定挂载将实例 workspace 挂载到容器内 `/home/node/.openclaw/workspace`
4. 容器内同步步骤从 `/home/node/.openclaw/workspace` 复制到 `/app/dist/plugins/node-auto-register`

**当前状态：** ✅ 已完成

---

## MC-012: 修复 localStorage 数据格式问题

**文件：** `plugins/node-auto-register/src/inject-auto-pair.js`

**问题描述：**

脚本保存的设备 token 格式与 Control UI 期望的格式不一致，导致配对成功后 WebSocket 连接仍然失败。

**问题分析：**

Control UI 使用 `loadDeviceAuthToken()` 从 localStorage 读取设备 token，期望的数据格式为：

```typescript
// 期望的格式（src/shared/device-auth.ts）
{
  version: 1;
  deviceId: string;
  tokens: {
    [role: string]: {
      token: string;
      role: string;        // ❌ 我们缺少这个字段
      scopes: string[];
      updatedAtMs: number; // ❌ 我们用的是 createdAtMs
    }
  }
}
```

但我们脚本保存的格式是：

```javascript
// 我们保存的格式（错误）
{
  version: 1,
  deviceId: deviceId,
  tokens: {
    operator: {
      token: deviceToken,
      scopes: ['control'],
      createdAtMs: Date.now(),  // ❌ 字段名错误
      // ❌ 缺少 role 字段
    }
  }
}
```

**问题后果：**
- `loadDeviceAuthTokenFromStore()` 检查 `entry.token` 是否存在
- 但缺少 `role` 字段可能导致其他验证失败
- 使用 `createdAtMs` 而非 `updatedAtMs` 可能导致类型不匹配

**修改方案：**

```javascript
// 修改前（错误）
const stored = {
  version: 1,
  deviceId: deviceId || 'auto-paired-' + Date.now(),
  tokens: {
    [role || 'operator']: {
      token: deviceToken,
      scopes: ['control'],
      createdAtMs: Date.now(),  // ❌ 错误字段名
    },
  },
};

// 修改后（正确）
const stored = {
  version: 1,
  deviceId: deviceId || 'auto-paired-' + Date.now(),
  tokens: {
    [role || 'operator']: {
      token: deviceToken,
      role: role || 'operator',    // ✅ 添加 role 字段
      scopes: ['control'],
      updatedAtMs: Date.now(),     // ✅ 使用正确字段名
    },
  },
};
```

**当前状态：** ✅ 已完成

---

## 后续优化建议

1. **添加配对历史记录**：记录每次配对的时间、IP 等信息
2. **添加配对失败重试机制**：网络错误时自动重试
3. **支持自定义设备信息**：允许用户指定设备名称、角色等
4. **添加配对状态查询 API**：用于前端显示配对进度
5. **支持批量配对**：一次性生成多个设备 token
