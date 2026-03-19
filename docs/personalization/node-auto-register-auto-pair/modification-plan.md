# Control UI 自动配对功能修改方案

## 修改项概览

| 修改项 | 文件 | 修改类型 | 状态 | 优先级 |
|--------|------|----------|------|--------|
| MC-001 | `scripts/generate-control-ui-invite-code.js` | 支持端口偏移 | ✅ 已完成 | P0 |
| MC-002 | `src/one-shot-pair-server.js` | 修复文件路径 | ✅ 已完成 | P0 |
| MC-003 | `src/inject-auto-pair.js` | 确保正确注入 | ✅ 已完成 | P0 |
| MC-004 | `src/index.js` | 确保服务注册 | ✅ 已完成 | P0 |

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
console.log('生成 Control UI 邀请码:');
console.log('  名称:', codeName);
console.log('  邀请码:', inviteCode);
console.log('  端口偏移:', portOffset === 0 ? '无' : `+${portOffset}`);
console.log('  访问 URL:', accessUrl);
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
   ```javascript
   function getDevicePairingPaths() {
     const openclawDir = process.env.OPENCLAW_DIR ||
                        path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw');
     const devicesDir = path.join(openclawDir, 'devices');
     return {
       dir: devicesDir,
       pendingPath: path.join(devicesDir, 'pending.json'),
       pairedPath: path.join(devicesDir, 'paired.json'),
     };
   }
   ```

2. **新增 `loadPendingRequests()` 函数**
   ```javascript
   function loadPendingRequests() {
     const { pendingPath } = getDevicePairingPaths();
     try {
       const data = fs.readFileSync(pendingPath, 'utf-8');
       return JSON.parse(data);
     } catch (err) {
       if (err.code === 'ENOENT') {
         return {};
       }
       throw err;
     }
   }
   ```

3. **新增 `savePendingRequests()` 函数（原子写入）**
   ```javascript
   function savePendingRequests(pendingById) {
     const { pendingPath } = getDevicePairingPaths();
     const dir = path.dirname(pendingPath);
     if (!fs.existsSync(dir)) {
       fs.mkdirSync(dir, { recursive: true });
     }
     // 原子写入：先写临时文件，再重命名
     const tmpPath = pendingPath + '.tmp';
     fs.writeFileSync(tmpPath, JSON.stringify(pendingById, null, 2), 'utf-8');
     fs.renameSync(tmpPath, pendingPath);
   }
   ```

4. **新增 `createPairingRequest()` 函数**
   ```javascript
   function createPairingRequest(deviceInfo) {
     const pendingById = loadPendingRequests();
     const requestId = `req-${Date.now()}-${randomUUID().substring(0, 8)}`;

     const now = Date.now();
     const pendingRequest = {
       requestId,
       deviceId: deviceInfo.deviceId,
       publicKey: deviceInfo.publicKey,
       displayName: deviceInfo.displayName,
       platform: deviceInfo.platform,
       deviceFamily: deviceInfo.deviceFamily,
       clientId: deviceInfo.clientId,
       clientMode: deviceInfo.clientMode,
       role: deviceInfo.role,
       roles: deviceInfo.role ? [deviceInfo.role] : undefined,
       scopes: deviceInfo.scopes,
       silent: true,
       isRepair: false,
       ts: now,
     };

     pendingById[requestId] = pendingRequest;
     savePendingRequests(pendingById);

     return { status: 'pending', request: pendingRequest, created: true };
   }
   ```

5. **修复 `handleOneShotPair()` 中的 `approveDevicePairing` 调用**
   ```javascript
   // 添加 baseDir 参数
   const baseDir = process.env.OPENCLAW_DIR ||
                   path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw');
   const approveResult = await approveDevicePairing(
     pairingResult.request.requestId,
     baseDir
   );
   ```

**验收测试：**

```bash
# 测试 API 调用
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<CODE>" | jq .

# 验证文件路径
cat ~/.openclaw/devices/pending.json | jq .
cat ~/.openclaw/devices/paired.json | jq .
```

---

## MC-003: 确保 inject-auto-pair.js 正确注入

**文件：** `plugins/node-auto-register/src/inject-auto-pair.js`

**功能描述：**
- 检测 URL 中的 `inviteCode` 参数
- 调用一键配对 API
- 保存设备 token 到 localStorage
- 自动刷新页面

**实现状态：** ✅ 已完成

**核心逻辑：**

```javascript
(function() {
  'use strict';

  const inviteCode = new URLSearchParams(window.location.search).get('inviteCode');
  if (!inviteCode) {
    console.log('[auto-pair] No inviteCode in URL, skipping auto-pair');
    return;
  }

  console.log('[auto-pair] Found inviteCode, starting auto-pair...');

  fetch('/plugins/node-auto-register/api/one-shot-pair?inviteCode=' + encodeURIComponent(inviteCode))
    .then(res => res.json())
    .then(data => {
      if (data.ok && data.deviceToken) {
        const stored = {
          version: 1,
          deviceId: data.deviceId,
          tokens: {
            [data.role]: {
              token: data.deviceToken,
              scopes: ['control'],
              createdAtMs: Date.now()
            }
          }
        };
        localStorage.setItem('openclaw.device.auth.v1', JSON.stringify(stored));
        console.log('[auto-pair] Device token saved to localStorage');
        console.log('[auto-pair] Reloading page...');
        location.reload();
      } else {
        console.error('[auto-pair] Pairing failed:', data.error);
      }
    })
    .catch(err => {
      console.error('[auto-pair] Error:', err);
    });
})();
```

**验收测试：**

1. 访问 `http://127.0.0.1:18889/control-ui/?inviteCode=xxx&session=main`
2. 打开浏览器 Console，查看日志
3. 打开 Network 面板，查看 API 调用
4. 打开 Application -> Local Storage，查看 token 保存

---

## MC-004: 确保服务注册

**文件：** `plugins/node-auto-register/src/index.js`

**功能描述：**
- 加载插件时注册一键配对 HTTP 路由
- 注入自动配对脚本到 Control UI 页面

**实现状态：** ✅ 已完成

**核心逻辑：**

```javascript
import { registerOneShotPairServer } from './one-shot-pair-server.js';
import { injectAutoPairScriptToControlUi } from './inject-auto-pair.js';

export function register(api) {
  console.log('[node-auto-register] Plugin loaded');

  // 注入自动配对脚本到 Control UI
  injectAutoPairScriptToControlUi();

  // 注册一键配对 HTTP 服务
  const cleanupOneShotPair = registerOneShotPairServer(api);

  // 返回清理函数
  return () => {
    console.log('[node-auto-register] Plugin unregistered');
    if (cleanupOneShotPair) {
      cleanupOneShotPair();
    }
  };
}
```

**验收测试：**

```bash
# 查看插件日志，确认服务注册成功
docker logs openclaw-gw1-openclaw-gateway-1 | grep "one-shot-pair"

# 期望输出：
# [one-shot-pair] === Registering one-shot pair server ===
# [one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair
```

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

---

## 修改日志

| 日期 | 修改项 | 说明 | 状态 |
|------|--------|------|------|
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
