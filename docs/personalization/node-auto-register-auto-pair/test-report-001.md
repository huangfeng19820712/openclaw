# 测试报告 #001 - Node Auto-Register 一键配对功能

## 测试日期
2026-03-18

## 测试环境
| 组件 | 版本/状态 | 说明 |
|------|----------|------|
| Node.js | >= 18.0.0 | |
| OpenClaw | 最新版 (Docker 部署) | 提交 f13c38d68 |
| 测试服务器 | 192.168.90.6 | SSH 访问 |
| 实例配置 | gw1 | PORT_OFFSET=100 |
| 容器名称 | openclaw-gw1-openclaw-gateway-1 | |

---

## 部署流程测试

| 步骤 | 状态 | 说明 |
|------|------|------|
| 清理容器 | ✅ 通过 | `cleanup-instance.sh` 正常删除容器和配置目录 |
| 代码更新 | ✅ 通过 | `git pull` 成功获取最新提交 |
| 重新部署 | ✅ 通过 | `docker-instance-setup.sh` 成功创建容器 |
| 容器运行 | ✅ 通过 | 容器正常启动并监听端口 |

### 部署日志摘要
```
Network openclaw-gw1_default Created
Container openclaw-gw1-openclaw-gateway-1 Started
Invite code generated: tlMJbJd5...WAVyDOgw
Auto-pair script injected successfully
```

---

## 插件加载测试

| 检查项 | 状态 | 日志输出 |
|--------|------|----------|
| 插件加载 | ✅ 通过 | `[node-auto-register] Plugin loaded` |
| 脚本注入 | ✅ 通过 | `Auto-pair script already injected` |
| API 注册 | ✅ 通过 | `[one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair` |

### 容器日志摘要
```
2026-03-18T12:58:27.363+00:00 [node-auto-register] Plugin loaded
2026-03-18T12:58:27.371+00:00 [one-shot-pair] === Registering one-shot pair server ===
2026-03-18T12:58:27.373+00:00 [one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair
2026-03-18T12:58:27.378+00:00 [one-shot-pair] === One-shot pair server registration complete ===
```

---

## 功能测试

### 1. 邀请码验证测试

| 测试项 | 输入 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| 有效邀请码 | `tlMJbJd5...` | 验证通过 | 验证成功 | ✅ |
| 无效邀请码 | `invalid_code` | 返回 401 错误 | 返回 401 | ✅ |

**API 响应示例（有效邀请码）：**
```
[one-shot-pair] Code " control-ui " validation successful
[one-shot-pair]   - Expires: 2027-03-18T12:58:22.593Z
[one-shot-pair]   - Max uses: 999
[one-shot-pair]   - Current uses: 0
```

**API 响应示例（无效邀请码）：**
```json
{"ok":false,"error":"invalid or expired invite code"}
```

---

### 2. 一键配对 API 测试

| 测试项 | 状态 | 响应/说明 |
|--------|------|----------|
| API 端点可达 | ✅ | HTTP 200 |
| 邀请码验证 | ✅ | validation successful |
| device-pairing 函数检查 | ❌ | functions not available |
| 配对完成 | ❌ | 返回错误 |

**API 错误响应：**
```json
{"ok":false,"error":"device-pairing functions not available"}
```

**完整日志：**
```
[one-shot-pair] === One-shot pair request received ===
[one-shot-pair] Invite code validation successful, code name: control-ui
[one-shot-pair] Error: device-pairing functions not available
```

---

## 发现的问题

### 🔴 严重问题：`one-shot-pair` API 无法完成配对

**问题描述：**
调用 `/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx` 返回错误：
```json
{"ok":false,"error":"device-pairing functions not available"}
```

**根本原因分析：**

1. **API 不匹配**：`one-shot-pair-server.js` 代码中使用了不存在的函数
   ```javascript
   // 代码期望的导入
   const devicePair = require('openclaw/plugin-sdk/device-pair');
   requestDevicePairing = devicePair.requestDevicePairing;  // ❌ undefined
   approveDevicePairing = devicePair.approveDevicePairing;  // ✅ function
   ```

2. **实际可用的导出函数**：
   ```javascript
   Keys: [
     'approveDevicePairing',     // ✅ 存在
     'listDevicePairing',        // ✅ 存在
     'resolveGatewayBindUrl',    // ✅ 存在
     'resolveTailnetHostWithRunner', // ✅ 存在
     'runPluginCommandWithTimeout' // ✅ 存在
   ]
   ```

3. **缺失的函数**：`requestDevicePairing` 不存在于当前 OpenClaw 版本中

**影响范围：**
- Control UI 自动配对功能无法完成
- 浏览器端调用 one-shot-pair API 会失败
- 邀请码验证通过，但配对步骤失败

---

## 修复建议

### 方案 A：修复 `one-shot-pair-server.js`（推荐）

修改 `one-shot-pair-server.js` 使用正确的 API：

1. 移除对 `requestDevicePairing` 的依赖
2. 直接操作 `device-pairing-state.json` 创建 pending 请求
3. 调用 `approveDevicePairing(requestId)` 完成配对

**伪代码示例：**
```javascript
// 创建配对请求（直接写入 state 文件）
async function createPairingRequest(deviceInfo) {
  const baseDir = process.env.OPENCLAW_DIR ||
                  path.join(process.env.HOME, '.openclaw');
  const statePath = path.join(baseDir, 'device-pairing-state.json');

  let state = { pendingById: {}, pairedByDeviceId: {} };
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch (e) {}

  const requestId = `req-${Date.now()}-${randomUUID().substring(0, 8)}`;
  state.pendingById[requestId] = { ...deviceInfo, ts: Date.now() };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return requestId;
}
```

### 方案 B：在 OpenClaw 中添加 `requestDevicePairing` 函数

在 `openclaw/plugin-sdk/device-pair` 模块中导出 `requestDevicePairing` 函数。

---

## 测试检查清单

| 测试场景 | 状态 | 备注 |
|----------|------|------|
| 部署流程 | ✅ | 清理、更新、部署均正常 |
| 插件加载 | ✅ | 插件正确加载并注册 HTTP 路由 |
| 邀请码验证 | ✅ | 有效/无效邀请码正确处理 |
| 一键配对 | ❌ | device-pairing 函数不可用 |
| 无效邀请码拒绝 | ✅ | 返回 401 错误 |
| Control UI 访问 | ✅ | 页面正常加载 |

---

## 结论

| 类别 | 状态 |
|------|------|
| 部署测试 | ✅ 通过 |
| 插件加载测试 | ✅ 通过 |
| 功能测试 | ❌ 失败 |

**根本原因：** `one-shot-pair-server.js` 引用了不存在的 `requestDevicePairing` 函数

**下一步行动：** 修复 `one-shot-pair-server.js` 以使用正确的 OpenClaw API

---

## 附录：测试命令

### 清理容器
```bash
OPENCLAW_CONFIG_DIR=/data/openclaw/openclaw_instances/gw1 \
  ./cleanup-instance.sh gw1
```

### 更新代码
```bash
cd /data/workspace/openclaw
git pull
```

### 重新部署
```bash
OPENCLAW_INSTANCE_ID=gw1 \
OPENCLAW_CONFIG_DIR=/data/openclaw/openclaw_instances/gw1 \
OPENCLAW_INSTANCE_BASE_DIR=/data/openclaw/openclaw_instances/ \
OPENCLAW_PORT_OFFSET=100 \
OPENCLAW_NO_ONBOARD=true \
  ./docker-instance-setup.sh
```

### 测试邀请码验证
```bash
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<INVITE_CODE>"
```

### 查看容器日志
```bash
docker logs openclaw-gw1-openclaw-gateway-1 --tail 30
```
