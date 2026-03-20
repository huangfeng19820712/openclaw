# Control UI 自动配对功能修改方案

## 修改项概览

| 修改项 | 文件 | 修改类型 | 状态 | 优先级 |
|--------|------|----------|------|--------|
| MC-001 | `scripts/generate-control-ui-invite-code.js` | 支持端口偏移 | ✅ 已完成 | P0 |
| MC-002 | `src/one-shot-pair-server.js` | 修复文件路径 | ✅ 已完成 | P0 |
| MC-003 | `src/inject-auto-pair.js` | 确保正确注入 | ✅ 已完成 | P0 |
| MC-004 | `src/index.js` | 确保服务注册 | ✅ 已完成 | P0 |
| MC-005 | `src/index.js` | 修复 CSP 问题（外部脚本引用） | ✅ 已完成 | P0 |

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
| 2026-03-20 | MC-005 | 修复 CSP 问题，改用插件 HTTP 路由提供脚本（`/plugins/node-auto-register/static/auto-pair.js`） | ✅ |
| 2026-03-19 | MC-001 | 添加 `OPENCLAW_PORT_OFFSET` 环境变量支持，修正端口计算逻辑 | ✅ |
| 2026-03-19 | MC-002 | 修复 `one-shot-pair-server.js` 文件路径和 `approveDevicePairing` 参数 | ✅ |
| 2026-03-19 | MC-003 | 确保 `inject-auto-pair.js` 正确注入 | ✅ |
| 2026-03-19 | MC-004 | 确保服务注册 | ✅ |

---

## 后续优化建议

1. **添加配对历史记录**：记录每次配对的时间、IP 等信息
2. **添加配对失败重试机制**：网络错误时自动重试
3. **支持自定义设备信息**：允许用户指定设备名称、角色等
4. **添加配对状态查询 API**：用于前端显示配对进度
5. **支持批量配对**：一次性生成多个设备 token
