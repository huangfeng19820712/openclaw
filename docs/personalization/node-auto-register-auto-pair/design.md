# Node Auto-Register 自动配对修复设计方案（最终版）

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
用户访问 ?inviteCode=xxx → 调用一键配对 API → 返回设备 token → 刷新页面
```

## 2. 解决方案

### 2.1 方案概述

采用**纯插件方案 + 一键配对 API**，通过 node-auto-register 插件实现以下功能：

1. **一键配对服务**：直接通过 HTTP API 完成配对，无需 WebSocket 连接
2. **浏览器注入脚本**：检测 inviteCode 并调用一键配对 API

**方案演变说明**：
- 初始方案尝试使用临时凭证 + WebSocket 代理
- 由于插件 API 不支持 WebSocket 路由，且 Gateway 认证需要 token，该方案不可行
- 最终采用一键配对方案，完全绕过 WebSocket 连接

### 2.2 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Control UI)                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              inject-auto-pair.js (injected)             │    │
│  │  - Detect inviteCode from URL                           │    │
│  │  - Call /api/one-shot-pair                              │    │
│  │  - Save device token to localStorage                    │    │
│  │  - Reload page                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP only (no WebSocket)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              node-auto-register Plugin                  │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │ one-shot-pair-server.js                         │    │    │
│  │  │ - Verify invite code                            │    │    │
│  │  │ - Create virtual device pairing request         │    │    │
│  │  │ - Approve pairing immediately                   │    │    │
│  │  │ - Return device token                           │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Device Pairing Module                      │    │
│  │  - requestDevicePairing(deviceInfo)                     │    │
│  │  - approveDevicePairing(requestId) → { device: { tokens } } │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 组件设计

#### 2.3.1 一键配对服务 (one-shot-pair-server.js) - 新增

**职责**：
- 验证 inviteCode 有效性
- 生成虚拟设备信息
- 创建配对请求（直接写入 device-pairing-state.json）
- 调用 approveDevicePairing 立即批准配对
- 返回设备 token

**端点**：
```
GET /plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx
```

**工作流程**：
```javascript
// 1. 验证 inviteCode
const verification = verifyInviteCode(inviteCode);
if (!verification.valid) {
  return error;
}

// 2. 生成虚拟设备信息
const deviceInfo = {
  deviceId: `auto-pair-${Date.now()}`,
  publicKey: `auto-generated-key`,
  displayName: 'Auto-Paired Device (Control UI)',
  platform: 'web',
  role: 'operator',
  scopes: ['control'],
};

// 3. 创建配对请求（直接写入 device-pairing-state.json）
// 注意：requestDevicePairing 未从 plugin-sdk 导出，需直接操作状态文件
const state = loadDevicePairingState();
const requestId = `req-${Date.now()}-${randomUUID().substring(0, 8)}`;
state.pendingById[requestId] = {
  requestId,
  ...deviceInfo,
  silent: true,
  ts: Date.now(),
};
saveDevicePairingState(state);

// 4. 批准配对
const approveResult = await approveDevicePairing(requestId);

// 5. 返回设备 token
const tokens = approveResult.device.tokens || {};
const firstRole = Object.keys(tokens)[0];
const deviceToken = firstRole ? tokens[firstRole].token : null;

return { ok: true, paired: true, deviceId, deviceToken, role: firstRole };
```

**实现说明**：
- 由于 `requestDevicePairing` 函数未从 `plugin-sdk/device-pair` 模块导出，采用直接操作 `device-pairing-state.json` 文件的方式创建配对请求
- `approveDevicePairing` 函数可用，用于批准配对并生成设备 token

#### 2.3.2 浏览器注入脚本 (inject-auto-pair.js) - 重写

**职责**：
1. 检测 URL 中的 inviteCode 参数
2. 调用 `/api/one-shot-pair` 完成配对
3. 保存设备 token 到 localStorage
4. 刷新页面

**工作流程**：
```javascript
// 1. 检测 inviteCode
const inviteCode = new URLSearchParams(window.location.search).get('inviteCode');
if (!inviteCode) return;

// 2. 调用一键配对 API
const response = await fetch('/plugins/node-auto-register/api/one-shot-pair?inviteCode=' + inviteCode);
const { deviceToken, role, deviceId } = await response.json();

// 3. 保存到 localStorage
const stored = {
  version: 1,
  deviceId,
  tokens: {
    [role]: {
      token: deviceToken,
      scopes: ['control'],
      createdAtMs: Date.now()
    }
  }
};
localStorage.setItem('openclaw.device.auth.v1', JSON.stringify(stored));

// 4. 刷新页面
location.reload();
```

#### 2.3.3 插件入口 (index.js) - 修改

**职责**：注册所有服务的 HTTP 路由

**修改点**：
```javascript
import { registerOneShotPairServer } from './one-shot-pair-server.js';

export function register(api) {
  // 注入脚本到 Control UI
  injectAutoPairScriptToControlUi();

  // 注册一键配对服务
  const cleanupOneShotPair = registerOneShotPairServer(api);

  return () => { cleanupOneShotPair(); };
}
```

#### 2.3.4 邀请码生成器 (generate-control-ui-invite-code.js) - 修改

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
│User  │         │Browser          │ │Plugin     │         │Gateway   │
│      │         │                 │ │           │         │          │
│ 1.   │────────▶│                 │ │           │         │          │
│    Access       │                 │ │           │         │          │
│    ?inviteCode  │                 │ │           │         │          │
│      │         │ 2. Detect       │ │           │         │          │
│      │         │    inviteCode   │ │           │         │          │
│      │         │ 3. Call         │ │           │         │          │
│      │────────▶│    /one-shot-   │───────────▶│           │          │
│      │         │    pair         │ │ Verify    │         │          │
│      │         │                 │ │ inviteCode│         │          │
│      │         │                 │ │ Generate  │         │          │
│      │         │                 │ │ virtual   │         │          │
│      │         │                 │ │ device    │         │          │
│      │         │                 │ │ Create    │         │          │
│      │         │                 │ │ pairing   │         │          │
│      │         │                 │ │ request   │         │          │
│      │         │                 │ │ Approve   │         │          │
│      │         │                 │ │ pairing   │         │          │
│      │         │                 │ │ Extract   │         │          │
│      │◀────────│                 │◀│ device    │         │          │
│      │         │                 │ │ token     │         │          │
│      │         │ 4. Save         │ │           │         │          │
│      │         │    deviceToken  │ │           │         │          │
│      │         │    to           │ │           │         │          │
│      │         │    localStorage │ │           │         │          │
│      │         │ 5. Reload       │ │           │         │          │
│      │         │─────┐           │ │           │         │          │
│      │         │◀────┘           │ │           │         │          │
│      │◀────────│                 │ │           │         │          │
│      │         │                 │ │           │         │          │
│ 6.   │         │                 │ │           │         │          │
│  Use │◀────────│                 │ │           │         │          │
│  Control UI with device token   │ │           │         │          │
└──────┘         └──────┘         └───────────┘         └──────────┘
```

### 3.2 详细步骤说明

| 步骤 | 描述 | 涉及组件 |
|------|------|----------|
| 1 | 用户访问 `http://localhost:18789/control-ui/?inviteCode=xxx` | 用户 |
| 2 | inject-auto-pair.js 检测到 inviteCode 参数 | 浏览器脚本 |
| 3 | 调用 `/api/one-shot-pair?inviteCode=xxx` | 浏览器脚本 |
| 4 | 验证 inviteCode 有效性 | one-shot-pair-server.js |
| 5 | 生成虚拟设备信息 | one-shot-pair-server.js |
| 6 | 创建配对请求 (`requestDevicePairing`) | Gateway device-pairing |
| 7 | 批准配对 (`approveDevicePairing`) | Gateway device-pairing |
| 8 | 从批准结果中提取设备 token | one-shot-pair-server.js |
| 9 | 返回设备 token 和角色信息给前端 | one-shot-pair-server.js |
| 10 | 脚本保存设备 token 到 localStorage | 浏览器脚本 |
| 11 | 刷新页面，使用保存的设备 token 自动登录 | 浏览器脚本 |

## 4. API 设计

### 4.1 一键配对 API

```
GET /plugins/node-auto-register/api/one-shot-pair

Query Parameters:
  - inviteCode (required): 邀请码

Response (200 OK):
{
  "ok": true,
  "paired": true,
  "deviceId": "auto-pair-1710000000000-abc123",
  "deviceToken": "token-abc...",
  "role": "operator",
  "displayName": "Auto-Paired Device (Control UI)"
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

Response (500 Internal Server Error):
{
  "ok": false,
  "error": "device-pairing functions not available"
}
```

## 5. 安全考虑

### 5.1 邀请码安全

- **验证逻辑**：检查过期时间、使用次数、激活状态
- **使用计数**：每次成功配对后增加使用次数
- **可撤销**：支持通过管理脚本禁用邀请码

### 5.2 虚拟设备

- 虚拟设备仅用于生成配对请求，实际不连接 WebSocket
- 设备 ID 包含时间戳和随机 UUID，保证唯一性
- 设备 token 在配对批准时动态生成，与真实设备相同

## 6. 文件结构

```
plugins/node-auto-register/
├── src/
│   ├── index.js                  # 插件入口（修改）
│   ├── one-shot-pair-server.js   # 一键配对服务（新增）
│   ├── auto-pair-server.js       # 自动配对服务（保留，备用）
│   ├── invite-pair-server.js     # 邀请凭证服务（保留，备用）
│   ├── temp-token-service.js     # 临时凭证服务（保留，备用）
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
- `requestDevicePairing(deviceInfo)` - 创建配对请求
- `approveDevicePairing(requestId)` - 批准配对并返回设备信息（含 tokens）

## 8. 优势

### 8.1 相比原方案的优势

| 特性 | 原方案 (WebSocket 代理) | 新方案 (一键配对) |
|------|------------------------|-------------------|
| 复杂度 | 高（需要 WebSocket 拦截） | 低（纯 HTTP API） |
| Gateway 修改 | 需要支持 tempToken | 无需修改 |
| 浏览器兼容性 | 需要 WebSocket | 仅需 Fetch API |
| 错误处理 | 复杂（WS + HTTP） | 简单（仅 HTTP） |
| 代码量 | ~500 行 | ~200 行 |

### 8.2 用户体验

- **简化 URL**：只需 `inviteCode`，无需 `token`
- **快速配对**：一次 HTTP 请求完成，无需等待 WebSocket 连接
- **自动刷新**：配对成功后自动刷新并登录

## 9. 后续优化

### 9.1 可能的改进
- 添加配对状态查询 API
- 支持批量配对
- 添加配对历史记录

### 9.2 可选功能
- 配对失败后的重试机制
- 详细的日志记录和监控
- 支持自定义设备信息
