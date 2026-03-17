# Node Auto-Register 自动配对修复设计方案

## 1. 问题背景

### 1.1 当前问题

node-auto-register 插件的 Control UI 自动配对功能存在逻辑问题：

- **当前实现**：要求用户访问 URL 时同时提供 `inviteCode` 和 `token`（Gateway token）
- **实际问题**：Gateway token 是访问 Control UI 页面的前置条件，用户在访问页面前无法获取
- **正确流程**：用户只需提供 `inviteCode`，配对完成后应自动生成设备专用 token

### 1.2 核心问题分析

```
错误流程（当前）：
用户访问 ?inviteCode=xxx&token=yyy → 自动配对 → 刷新页面
                              ↑
                    问题：token 从哪来？

正确流程（目标）：
用户访问 ?inviteCode=xxx → 获取临时凭证 → 建立 WS 连接 → 生成配对请求 → 自动批准 → 返回设备 token → 刷新页面
```

## 2. 解决方案

### 2.1 方案概述

采用**纯插件方案**，通过 node-auto-register 插件实现以下功能：

1. **临时凭证服务**：生成一次性、5 分钟有效期的临时 token
2. **自动配对服务**：检测配对请求并自动批准
3. **浏览器注入脚本**：获取临时凭证、拦截 WebSocket 连接、保存设备 token

**注意**：由于插件 API 不支持注册 WebSocket 路由，原定的 WebSocket 代理方案无法实现。
实际实现采用简化方案：前端脚本在建立 WebSocket 连接时，将 tempToken 添加到 URL 查询参数中。
Gateway 端的 trusted-proxy 认证模式允许 operator 角色无需设备身份即可连接。

### 2.2 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Control UI)                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              inject-auto-pair.js (injected)             │    │
│  │  - Detect inviteCode from URL                           │    │
│  │  - Fetch tempToken from /api/invite-pair                │    │
│  │  - Hijack WebSocket: add tempToken to URL               │    │
│  │  - Detect device.pair.requested event                   │    │
│  │  - Auto-pair via /api/auto-pair                         │    │
│  │  - Save device token to localStorage                    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              node-auto-register Plugin                  │    │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐   │    │
│  │  │ invite-pair-    │  │ auto-pair-server.js         │   │    │
│  │  │ server.js       │  │ - Verify invite code        │   │    │
│  │  │ - Generate      │  │ - Approve pairing request   │   │    │
│  │  │   tempToken     │  │ - Return device token       │   │    │
│  │  │ - Memory store  │  └─────────────────────────────┘   │    │
│  │  │ - 5min expiry   │                                     │    │
│  │  └─────────────────┘  ┌─────────────────────────────┐   │    │
│  │                       │ temp-token-service.js       │   │    │
│  │                       │ (internal, no direct HTTP)  │   │    │
│  │                       └─────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Device Pairing Module                      │    │
│  │  - approveDevicePairing(requestId) → { device: { tokens } } │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**说明**：
- 前端通过 HTTP API 获取 tempToken
- WebSocket 连接时，tempToken 作为 URL 参数传递
- Gateway 在 trusted-proxy 模式下允许 operator 角色连接
- 配对完成后，设备 token 保存到 localStorage

### 2.3 组件设计

#### 2.3.1 临时凭证服务 (temp-token-service.js)

**职责**：
- 生成一次性临时凭证（tempToken）
- 内存存储，5 分钟有效期
- 验证并消耗临时凭证

**API**：
```javascript
// 生成临时凭证
function generateTempToken(): string

// 验证临时凭证（验证后立即删除）
function verifyTempToken(tempToken: string): boolean
```

**存储格式**：
```javascript
// 内存 Map
tempTokenStore = Map<string, {
  createdAt: number,    // 创建时间戳
  expiresAt: number,    // 过期时间戳（5 分钟）
  used: boolean         // 是否已使用
}>
```

#### 2.3.2 邀请凭证服务 (invite-pair-server.js)

**职责**：
- 提供 HTTP API 获取临时凭证
- 验证 inviteCode 有效性
- 生成并返回 tempToken

**端点**：
```
GET /plugins/node-auto-register/api/invite-pair?inviteCode=xxx

Response:
{
  ok: true,
  tempToken: "xxx",
  expiresInSeconds: 300
}
```

#### 2.3.3 自动配对服务 (auto-pair-server.js) - 修改

**职责**：
- 验证 inviteCode
- 检测并批准待处理的配对请求
- 从批准结果中提取设备 token

**端点**：
```
GET /plugins/node-auto-register/api/auto-pair?inviteCode=xxx

Response:
{
  ok: true,
  paired: true,
  deviceId: "xxx",
  deviceToken: "yyy",  // 新增
  role: "operator"     // 新增
}
```

**修改点**：
```javascript
const result = await approveDevicePairing(pending.requestId);
if (result) {
  // 从返回结果中提取设备 token
  const tokens = result.device.tokens || {};
  const firstRole = Object.keys(tokens)[0];
  const deviceToken = firstRole ? tokens[firstRole].token : null;

  sendJson(res, 200, {
    ok: true,
    paired: true,
    deviceId: result.device.deviceId,
    deviceToken,  // 新增
    role: firstRole  // 新增
  });
}
```

#### 2.3.4 浏览器注入脚本 (inject-auto-pair.js) - 重写

**职责**：
1. 检测 URL 中的 inviteCode 参数
2. 调用 `/api/invite-pair` 获取 tempToken
3. 拦截 WebSocket 连接，在 URL 中添加 tempToken 参数
4. 监听 `device.pair.requested` 事件
5. 调用 `/api/auto-pair` 获取设备 token
6. 保存设备 token 到 localStorage
7. 刷新页面

**工作流程**：
```javascript
// 1. 检测 inviteCode
const urlParams = new URLSearchParams(window.location.search);
const inviteCode = urlParams.get('inviteCode');
if (!inviteCode) return;

// 2. 获取临时凭证
const tempTokenResp = await fetch('/plugins/node-auto-register/api/invite-pair?inviteCode=' + inviteCode);
const { tempToken } = await tempTokenResp.json();

// 3. 拦截 WebSocket 连接，在 URL 上添加 tempToken 参数
const originalWebSocket = window.WebSocket;
window.WebSocket = function(url) {
  if (url.includes('/connect')) {
    const separator = url.includes('?') ? '&' : '?';
    url = url + separator + 'tempToken=' + encodeURIComponent(tempToken);
  }
  return new originalWebSocket(url);
};

// 4. 监听配对事件 (通过 WebSocket 消息)
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.method === 'device.pair.requested') {
    completePairing(inviteCode);
  }
});

// 5. 完成配对
async function completePairing(inviteCode) {
  const resp = await fetch('/plugins/node-auto-register/api/auto-pair?inviteCode=' + inviteCode);
  const { deviceToken, role } = await resp.json();

  // 6. 保存到 localStorage
  const storageKey = 'openclaw.device.auth.v1';
  const stored = {
    version: 1,
    deviceId: 'auto-paired-' + Date.now(),
    tokens: {
      [role]: {
        token: deviceToken,
        scopes: ['control'],
        createdAtMs: Date.now()
      }
    }
  };
  localStorage.setItem(storageKey, JSON.stringify(stored));

  // 7. 刷新页面
  location.reload();
}
```

**注意**：由于插件不支持 WebSocket 路由，脚本直接在 WebSocket URL 上添加 tempToken 参数，
而不是重定向到代理端点。

#### 2.3.5 插件入口 (index.js) - 修改

**职责**：注册所有服务的 HTTP 路由

**修改点**：
```javascript
import { registerInvitePairServer } from './invite-pair-server.js';
import { registerAutoPairServer } from './auto-pair-server.js';

export function register(api) {
  // 注入脚本到 Control UI
  injectAutoPairScriptToControlUi();

  // 注册临时凭证服务
  const cleanupInvitePair = registerInvitePairServer(api);

  // 注册自动配对服务
  const cleanupAutoPair = registerAutoPairServer(api);

  // 返回清理函数
  return () => {
    cleanupInvitePair();
    cleanupAutoPair();
  };
}
```

#### 2.3.6 邀请码生成器 (generate-control-ui-invite-code.js) - 修改

**修改前**：
```javascript
const accessUrl = `http://127.0.0.1:${port}/control-ui/?inviteCode=${inviteCode}&token=${gatewayToken}&session=main`;
```

**修改后**：
```javascript
const accessUrl = `http://127.0.0.1:${port}/control-ui/?inviteCode=${inviteCode}&session=main`;
```

## 3. 工作流程

### 3.1 完整流程图

```
┌──────┐         ┌──────┐         ┌───────────┐         ┌──────────┐
│User  │         │Browser        │ │Plugin     │         │Gateway   │
│      │         │               │ │           │         │          │
│ 1.   │────────▶│               │ │           │         │          │
│    Access      │               │ │           │         │          │
│    ?inviteCode │               │ │           │         │          │
│      │         │ 2. Detect     │ │           │         │          │
│      │         │    inviteCode │ │           │         │          │
│      │         │ 3. Get        │ │           │         │          │
│      │────────▶│    tempToken  │───────────▶│           │          │
│      │         │               │ │ Verify    │         │          │
│      │         │               │ │ inviteCode│         │          │
│      │         │               │ │ Generate  │         │          │
│      │◀────────│               │◀│ tempToken │         │          │
│      │         │ 4. Hijack     │ │           │         │          │
│      │         │    WebSocket  │ │           │         │          │
│      │         │    to        │ │           │         │          │
│      │         │    /ws-pair- │ │           │         │          │
│      │         │    connect   │ │           │         │          │
│      │         │──────────────▶│           │         │          │
│      │         │               │ │ Validate  │         │          │
│      │         │               │ │ tempToken │         │          │
│      │         │               │ │ Proxy to  │         │          │
│      │         │               │ │ /connect  │────────▶│          │
│      │         │               │ │           │         │5. WS     │
│      │         │               │ │           │         │  connected
│      │         │               │ │           │◀────────│6. Generate
│      │         │               │ │           │         │  pairing
│      │         │               │ │           │         │  request
│      │         │ 7. Detect     │ │           │         │          │
│      │         │    pairing    │ │           │         │          │
│      │         │    event      │ │           │         │          │
│      │         │ 8. Call       │ │           │         │          │
│      │         │    /api/auto- │ │           │         │          │
│      │────────▶│    pair       │───────────▶│           │          │
│      │         │               │ │ Verify    │         │          │
│      │         │               │ │ inviteCode│         │          │
│      │         │               │ │ Approve   │         │          │
│      │         │               │ │ pairing   │────────▶│          │
│      │         │               │ │           │         │9. Return│
│      │         │               │◀│ device    │         │  device │
│      │         │               │ │ token     │         │  info   │
│      │◀────────│               │ │           │         │          │
│      │         │ 10. Save      │ │           │         │          │
│      │         │     device    │ │           │         │          │
│      │         │     token to  │ │           │         │          │
│      │         │     localStorage          │ │           │         │          │
│      │         │ 11. Reload    │ │           │         │          │
│      │         │─────┐         │ │           │         │          │
│      │         │◀────┘         │ │           │         │          │
│      │◀────────│               │ │           │         │          │
│      │         │               │ │           │         │          │
│ 12.  │         │               │ │           │         │          │
│  Use │◀────────│               │ │           │         │          │
│  Control UI with device token │ │           │         │          │
└──────┘         └──────┘         └───────────┘         └──────────┘
```

### 3.2 详细步骤说明

| 步骤 | 描述 | 涉及组件 |
|------|------|----------|
| 1 | 用户访问 `http://localhost:18789/control-ui/?inviteCode=xxx` | 用户 |
| 2 | inject-auto-pair.js 检测到 inviteCode 参数 | 浏览器脚本 |
| 3 | 调用 `/api/invite-pair?inviteCode=xxx` 获取 tempToken | invite-pair-server.js |
| 4 | 验证 inviteCode 有效性，生成 tempToken（5 分钟有效） | temp-token-service.js |
| 5 | 脚本拦截 WebSocket 连接，重定向到 `/ws-pair-connect?tempToken=xxx` | 浏览器脚本 |
| 6 | 验证 tempToken，代理连接到 `/connect` | 内部代理逻辑 |
| 7 | WebSocket 连接建立，Gateway 生成 `device.pair.requested` 事件 | Gateway |
| 8 | 脚本检测到配对事件，调用 `/api/auto-pair?inviteCode=xxx` | 浏览器脚本 |
| 9 | 验证 inviteCode，查找并批准待处理的配对请求 | auto-pair-server.js |
| 10 | 从 `approveDevicePairing` 返回结果中提取设备 token | Gateway device-pairing |
| 11 | 返回设备 token 和角色信息给前端 | auto-pair-server.js |
| 12 | 脚本保存设备 token 到 localStorage | 浏览器脚本 |
| 13 | 刷新页面，使用保存的设备 token 自动登录 | 浏览器脚本 |

## 4. API 设计

### 4.1 临时凭证获取 API

```
GET /plugins/node-auto-register/api/invite-pair

Query Parameters:
  - inviteCode (required): 邀请码

Response (200 OK):
{
  "ok": true,
  "tempToken": "abc123...",
  "expiresInSeconds": 300
}

Response (400 Bad Request):
{
  "ok": false,
  "error": "inviteCode is required"
}

Response (401 Unauthorized):
{
  "ok": false,
  "error": "invalid or expired invite code",
  "codeName": "test-code"
}
```

### 4.2 自动配对 API

```
GET /plugins/node-auto-register/api/auto-pair

Query Parameters:
  - inviteCode (required): 邀请码

Response (200 OK):
{
  "ok": true,
  "paired": true,
  "deviceId": "device-123",
  "deviceToken": "token-abc...",
  "role": "operator"
}

Response (200 OK, 已配对):
{
  "ok": true,
  "alreadyPaired": true
}

Response (401 Unauthorized):
{
  "ok": false,
  "error": "invalid or expired invite code"
}

Response (500 Internal Server Error):
{
  "ok": false,
  "error": "Failed to approve pairing"
}
```

### 4.3 WebSocket 代理端点

```
WS /plugins/node-auto-register/ws-pair-connect

Query Parameters:
  - tempToken (required): 临时凭证

Behavior:
  1. 验证 tempToken 有效性
  2. 验证成功后，代理连接到 /connect
  3. 转发所有消息
  4. tempToken 验证后立即失效（一次性使用）
```

## 5. 安全考虑

### 5.1 临时凭证安全

- **一次性使用**：验证后立即从存储中删除
- **短有效期**：5 分钟过期，防止重放攻击
- **内存存储**：不写入磁盘，服务重启后自动清空
- **随机生成**：使用加密安全的随机数生成器

### 5.2 邀请码安全

- **验证逻辑**：检查过期时间、使用次数、激活状态
- **使用计数**：每次成功配对后增加使用次数
- **可撤销**：支持通过管理脚本禁用邀请码

### 5.3 WebSocket 代理安全

- **tempToken 验证**：只有有效 tempToken 才能建立代理连接
- **一对一映射**：一个 tempToken 只能建立一次连接
- **无状态代理**：代理层不存储任何敏感信息

## 6. 文件结构

```
plugins/node-auto-register/
├── src/
│   ├── index.js                  # 插件入口（修改）
│   ├── auto-pair-server.js       # 自动配对服务（修改）
│   ├── invite-pair-server.js     # 邀请凭证服务（新增）
│   ├── temp-token-service.js     # 临时凭证服务（新增）
│   └── inject-auto-pair.js       # 浏览器注入脚本（重写）
├── scripts/
│   ├── generate-control-ui-invite-code.js  # 邀请码生成器（修改）
│   ├── manage-invite-codes.js    # 邀请码管理器
│   └── ...
└── docs/
    └── ...
```

## 7. 依赖项

### 7.1 新增依赖
无（使用 Node.js 原生模块）

### 7.2 Gateway 依赖
- `approveDevicePairing(requestId)` - 批准配对并返回设备信息（含 tokens）
- `listDevicePairing()` - 获取待处理配对列表

## 8. 测试考虑

### 8.1 单元测试
- tempToken 生成和验证逻辑
- inviteCode 验证逻辑
- tempToken 过期处理

### 8.2 集成测试
- 完整的自动配对流程
- WebSocket 代理连接
- localStorage token 保存

### 8.3 边界测试
- tempToken 过期后使用
- tempToken 重复使用
- inviteCode 过期/达到使用次数
- 无待处理配对请求时的行为

## 9. 后续优化

### 9.1 可能的改进
- 支持多个待处理配对请求的处理（当前只处理第一个）
- 添加配对状态查询 API
- 支持 WebSocket 连接的错误重试
- 添加详细的日志记录和监控

### 9.2 可选功能
- 临时凭证有效期可配置
- 支持批量生成临时凭证
- 添加临时凭证使用统计
