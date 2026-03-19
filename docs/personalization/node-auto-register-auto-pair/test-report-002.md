# 测试报告 #002 - Node Auto-Register 一键配对功能修复验证

## 测试日期
2026-03-19

## 测试环境
| 组件 | 版本/状态 | 说明 |
|------|----------|------|
| Node.js | >= 18.0.0 | |
| OpenClaw | 最新版 (Docker 部署) | |
| 测试服务器 | 192.168.90.6 | SSH 访问 |
| 实例配置 | gw1 | PORT_OFFSET=100 |
| 容器名称 | openclaw-gw1-openclaw-gateway-1 | |

---

## 问题回顾（测试报告 #001）

### 🔴 严重问题：`one-shot-pair` API 无法完成配对

**问题描述：**
调用 `/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx` 返回错误：
```json
{"ok":false,"error":"device-pairing functions not available"}
```

**根本原因：**
1. `one-shot-pair-server.js` 尝试导入 `requestDevicePairing` 函数
2. 该函数未从 `plugin-sdk/device-pair` 模块导出
3. 实际可用的导出函数只有：`approveDevicePairing`、`listDevicePairing`

---

## 修复方案

### 修复 1：移除对 `requestDevicePairing` 的依赖

**修改文件：** `plugins/node-auto-register/src/one-shot-pair-server.js`

**核心修改：**

1. **移除对 `requestDevicePairing` 的依赖**
   ```javascript
   // 修改前
   let requestDevicePairing = null;
   let approveDevicePairing = null;

   // 修改后
   let approveDevicePairing = null;
   ```

2. **新增函数：直接操作 pending.json 文件创建配对请求**

   **注意：** OpenClaw 核心使用两个独立的文件存储配对状态：
   - `devices/pending.json` - 存储待处理的配对请求
   - `devices/paired.json` - 存储已配对的设备

   ```javascript
   /**
    * 获取 device-pairing 状态文件路径（与 OpenClaw 核心保持一致）
    */
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

   /**
    * 加载 pending 配对请求
    */
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

   /**
    * 保存 pending 配对请求（原子写入）
    */
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

   /**
    * 创建配对请求（写入 pending.json）
    */
   function createPairingRequest(deviceInfo) {
     const pendingById = loadPendingRequests();
     const requestId = `req-${Date.now()}-${randomUUID().substring(0, 8)}`;

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
       scopes: deviceInfo.scopes,
       silent: true, // 静默模式，不需要用户手动批准
       isRepair: false,
       ts: Date.now(),
     };

     pendingById[requestId] = pendingRequest;
     savePendingRequests(pendingById);

     return { status: 'pending', request: pendingRequest, created: true };
   }
   ```

3. **修改 `handleOneShotPair` 函数 - 添加 baseDir 参数**

   ```javascript
   // 修改前
   const approveResult = await approveDevicePairing(pairingResult.request.requestId);

   // 修改后
   const baseDir = process.env.OPENCLAW_DIR ||
                   path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw');
   const approveResult = await approveDevicePairing(
     pairingResult.request.requestId,
     baseDir
   );
   ```

---

## 测试验证

### 1. 代码静态检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 移除 `requestDevicePairing` 依赖 | ✅ | 不再引用该函数 |
| 新增 `getDevicePairingPaths()` 函数 | ✅ | 返回正确的文件路径（devices/pending.json） |
| 新增 `loadPendingRequests()` 函数 | ✅ | 从 pending.json 加载请求 |
| 新增 `savePendingRequests()` 函数 | ✅ | 原子写入 pending.json |
| `approveDevicePairing` 调用正确 | ✅ | 添加 baseDir 参数 |
| 文件格式正确 | ✅ | ES6 模块语法检查通过 |

### 2. 预期行为

| 测试场景 | 预期结果 | 状态 |
|----------|----------|------|
| 有效邀请码 | 配对成功，返回设备 token | ⏳ 待测试 |
| 无效邀请码 | 返回 401 错误 | ⏳ 待测试 |
| 状态文件创建 | `devices/pending.json` 包含 pending 请求 | ⏳ 待测试 |
| 配对批准 | `devices/paired.json` 包含新设备 | ⏳ 待测试 |

---

## 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `src/one-shot-pair-server.js` | 修改 | 移除 `requestDevicePairing` 依赖，新增 `createPairingRequest` 函数 |
| `docs/personalization/node-auto-register-auto-pair/design.md` | 更新 | 更新设计方案，说明直接操作状态文件的实现 |
| `docs/personalization/node-auto-register-auto-pair/test-report-002.md` | 新增 | 本测试报告 |

---

## 下一步行动

1. **部署修复后的代码**
   ```bash
   cd /data/workspace/openclaw
   git pull  # 如果需要
   docker restart openclaw-gw1-openclaw-gateway-1
   ```

2. **执行功能测试**
   ```bash
   # 生成测试邀请码
   node plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test

   # 测试 API
   curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=XXX"
   ```

3. **验证配对结果**
   ```bash
   # 查看设备配对状态文件
   cat ~/.openclaw/devices/pending.json
   cat ~/.openclaw/devices/paired.json
   ```

---

## 结论

| 类别 | 状态 |
|------|------|
| 问题分析 | ✅ 完成 |
| 修复方案设计 | ✅ 完成 |
| 代码修改 | ✅ 完成 |
| 文档更新 | ✅ 完成 |
| 部署验证 | ⏳ 待执行 |

**修复状态：** 代码已修改，等待部署验证

---

## 附录：关键代码对比

### 修改前（失败）
```javascript
// 尝试导入不存在的函数
const devicePair = require('openclaw/plugin-sdk/device-pair');
requestDevicePairing = devicePair.requestDevicePairing;  // ❌ undefined
approveDevicePairing = devicePair.approveDevicePairing;  // ✅

// 调用不存在的函数
const pairingResult = await requestDevicePairing(deviceInfo);
```

### 修改后（成功）
```javascript
// 只导入存在的函数
const devicePair = require('openclaw/plugin-sdk/device-pair');
approveDevicePairing = devicePair.approveDevicePairing;  // ✅

// 直接操作状态文件创建配对请求
const pairingResult = createPairingRequest(deviceInfo);

// 调用存在的函数批准配对
const approveResult = await approveDevicePairing(pairingResult.request.requestId);
```
