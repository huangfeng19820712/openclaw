# 测试报告 #002 - Node Auto-Register 一键配对功能

## 测试日期
2026-03-19

## 测试环境
| 组件 | 版本/状态 | 说明 |
|------|----------|------|
| Node.js | >= 18.0.0 | |
| OpenClaw | 最新版 (Docker 部署) | 提交 f858eb65a |
| 测试服务器 | 192.168.90.6 | SSH 访问 |
| 实例配置 | gw1 | PORT_OFFSET=100 |
| 容器名称 | openclaw-gw1-openclaw-gateway-1 | |

---

## 部署流程测试

| 步骤 | 状态 | 说明 |
|------|------|------|
| 清理容器 | ✅ 通过 | `cleanup-instance.sh` 正常删除容器和配置目录 |
| 代码更新 | ✅ 通过 | `git pull` 成功获取最新提交 f858eb65a |
| 重新部署 | ✅ 通过 | `docker-instance-setup.sh` 成功创建容器 |
| 容器运行 | ✅ 通过 | 容器正常启动并监听端口 |

### 部署日志摘要
```
Network openclaw-gw1_default Created
Container openclaw-gw1-openclaw-gateway-1 Started
Invite code generated: SFTEjZk0...kQnIwaWA
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
2026-03-19T07:13:38.041+00:00 [node-auto-register] Plugin loaded
2026-03-19T07:13:38.050+00:00 [one-shot-pair] === Registering one-shot pair server ===
2026-03-19T07:13:38.052+00:00 [one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair
2026-03-19T07:13:38.057+00:00 [one-shot-pair] === One-shot pair server registration complete ===
```

---

## 功能测试

### 1. 邀请码验证测试

| 测试项 | 输入 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| 有效邀请码 | `SFTEjZk0...` | 验证通过 | 验证成功 | ✅ |
| 无效邀请码 | `invalid_code_xyz` | 返回 401 错误 | 返回 401 | ✅ |

**API 响应示例（有效邀请码）：**
```
[one-shot-pair] Code " control-ui " validation successful
[one-shot-pair]   - Expires: 2027-03-19T07:13:32.543Z
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
| 虚拟设备生成 | ✅ | `auto-pair-xxx` 已生成 |
| 配对请求创建 | ✅ | 写入 state 文件成功 |
| 配对批准 | ❌ | `Failed to approve pairing` |

**完整日志：**
```
[one-shot-pair] === One-shot pair request received ===
[one-shot-pair] Invite code validation successful, code name: control-ui
[one-shot-pair] Generated virtual device: auto-pair-1773904465883-d556f22b
[one-shot-pair] Creating pairing request...
[one-shot-pair] Pairing request created in state file: req-1773904465887-7eda9343
[one-shot-pair] Pairing request created: req-1773904465887-7eda9343
[one-shot-pair] Approving pairing...
[one-shot-pair] Failed to approve pairing
```

**API 响应：**
```json
{"ok":false,"error":"Failed to approve pairing"}
```

---

## 发现的问题

### 🔴 问题 1：`approveDevicePairing` 函数调用缺少 `baseDir` 参数

**问题描述：**
调用 `approveDevicePairing(requestId)` 失败，返回 `Failed to approve pairing`

**根本原因分析：**

1. **函数签名**：
   ```javascript
   async function approveDevicePairing(requestId, baseDir) {
       return await withLock(async () => {
           const state = await loadState(baseDir);
           const pending = state.pendingById[requestId];
           if (!pending) return null;
           // ...
       });
   }
   ```

2. **代码调用**（第 311 行）：
   ```javascript
   const approveResult = await approveDevicePairing(pairingResult.request.requestId);
   ```
   只传了 `requestId`，缺少 `baseDir` 参数

3. **正确调用**：
   ```javascript
   const baseDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME, '.openclaw');
   const approveResult = await approveDevicePairing(requestId, baseDir);
   ```

**影响范围：**
- 一键配对功能无法完成
- 配对请求被创建但无法批准

**修复方案：**
修改 `one-shot-pair-server.js` 第 311 行：
```javascript
// 当前代码
const approveResult = await approveDevicePairing(pairingResult.request.requestId);

// 修复后
const baseDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw');
const approveResult = await approveDevicePairing(pairingResult.request.requestId, baseDir);
```

---

### 进展对比（与测试报告 #001 相比）

| 功能 | 测试报告 #001 | 测试报告 #002 | 状态变化 |
|------|--------------|--------------|----------|
| 插件加载 | ✅ | ✅ | 保持 |
| API 注册 | ✅ | ✅ | 保持 |
| 邀请码验证 | ✅ | ✅ | 保持 |
| device-pairing 函数导入 | ❌ `functions not available` | ✅ 正常 | **已修复** |
| 配对请求创建 | ❌ 无法创建 | ✅ 成功创建 | **已修复** |
| 配对批准 | ❌ N/A | ❌ 参数缺失 | 新问题 |

---

## 测试检查清单

| 测试场景 | 状态 | 备注 |
|----------|------|------|
| 部署流程 | ✅ | 清理、更新、部署均正常 |
| 插件加载 | ✅ | 插件正确加载并注册 HTTP 路由 |
| 邀请码验证 | ✅ | 有效/无效邀请码正确处理 |
| 一键配对 API | ⚠️ 部分通过 | 配对请求创建成功，但批准失败 |
| 无效邀请码拒绝 | ✅ | 返回 401 错误 |
| Control UI 访问 | ✅ | 页面正常加载 |

---

## 结论

| 类别 | 状态 | 说明 |
|------|------|------|
| 部署测试 | ✅ 通过 | - |
| 插件加载测试 | ✅ 通过 | - |
| 功能测试 | ⚠️ 部分通过 | 配对请求可创建，但批准失败 |

**与测试报告 #001 相比的进展：**
- ✅ 已修复：`device-pairing functions not available` 问题
- ✅ 已修复：配对请求创建功能
- 🔴 新问题：`approveDevicePairing` 函数调用缺少 `baseDir` 参数

**下一步行动：**
修复 `one-shot-pair-server.js` 第 311 行，添加 `baseDir` 参数调用 `approveDevicePairing`

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

### 测试一键配对 API
```bash
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<INVITE_CODE>"
```

### 查看容器日志
```bash
docker logs openclaw-gw1-openclaw-gateway-1 --tail 50
```
