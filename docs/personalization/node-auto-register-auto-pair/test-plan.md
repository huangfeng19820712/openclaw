# Node Auto-Register 自动配对功能测试验证方案

## 1. 测试环境准备

### 1.1 环境要求

| 组件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.0.0 | 运行 OpenClaw 和插件 |
| OpenClaw | 最新版 | 包含 device-pairing 模块 |
| 浏览器 | Chrome/Firefox/Edge | 支持 Fetch API 和 localStorage |

### 1.2 测试前准备

```bash
# 1. 确保 OpenClaw 已编译
cd E:\fwwork\javaws\openclaw
npm run build

# 2. 生成测试邀请码
node plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-auto-pair

# 3. 启动 OpenClaw Gateway
npm start

# 4. 验证插件已加载
# 查看启动日志，确认以下输出：
# [node-auto-register] Plugin loaded
# [one-shot-pair] === Registering one-shot pair server ===
# [one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair
```

### 1.3 验证邀请码已生成

```bash
# 查看邀请码文件
cat ~/.openclaw/invite-codes.json

# 或使用管理脚本
node plugins/node-auto-register/scripts/manage-invite-codes.js list
```

预期输出：
```json
{
  "test-auto-pair-1234567890": {
    "code": "abc123...",
    "createdAt": 1710000000000,
    "expiresAt": 1741536000000,
    "maxUses": 999,
    "usedCount": 0,
    "active": true,
    "kind": "control-ui",
    "description": "Control UI auto-pair invite code"
  }
}
```

## 2. 测试步骤

### 2.1 测试场景 1：正常一键配对流程

**测试目标**：验证一键配对功能是否正常工作

**前置条件**：
- OpenClaw Gateway 正在运行
- 已生成有效的邀请码
- 浏览器未保存任何设备 token（干净环境）

**测试步骤**：

1. **清除浏览器 localStorage（可选）**
   ```javascript
   // 在浏览器控制台执行
   localStorage.removeItem('openclaw.device.auth.v1');
   ```

2. **访问 Control UI URL**
   ```
   http://127.0.0.1:18789/control-ui/?inviteCode=<INVITE_CODE>&session=main
   ```
   替换 `<INVITE_CODE>` 为实际邀请码

3. **观察浏览器控制台日志**
   打开浏览器开发者工具（F12），查看 Console 输出

4. **观察 Network 面板**
   查看 `/plugins/node-auto-register/api/one-shot-pair` 请求

5. **观察 Gateway 日志**
   查看 OpenClaw 启动终端的日志输出

**预期结果**：

| 步骤 | 预期行为 | 验证方式 |
|------|----------|----------|
| 页面加载 | inject-auto-pair.js 执行 | 浏览器控制台显示相关日志 |
| 配对请求 | API 调用成功 | Network 面板显示 200 响应 |
| Token 保存 | localStorage 包含设备 token | Application 面板查看 |
| 页面刷新 | 自动重新加载 | 页面刷新，显示 Control UI 主界面 |

**浏览器控制台预期日志**：
```
[openclaw-auto-pair] === Auto-pair script started ===
[openclaw-auto-pair] Invite code detected: abc123...
[openclaw-auto-pair] Starting one-shot pair process...
[openclaw-auto-pair] Requesting one-shot pair...
[openclaw-auto-pair] Device paired successfully!
[openclaw-auto-pair]   - deviceId: auto-pair-...
[openclaw-auto-pair]   - role: operator
[openclaw-auto-pair] Device token saved to localStorage
[openclaw-auto-pair] URL parameters cleaned
[openclaw-auto-pair] Reloading page in 1 second...
[openclaw-auto-pair] Reloading...
```

**Gateway 预期日志**：
```
[node-auto-register] Plugin loaded
[one-shot-pair] === Registering one-shot pair server ===
[one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair
[one-shot-pair] === One-shot pair request received ===
[one-shot-pair] Invite code validation successful, code name: test-auto-pair-...
[one-shot-pair] Generated virtual device: auto-pair-...
[one-shot-pair] Creating pairing request...
[one-shot-pair] Pairing request created: req-...
[one-shot-pair] Approving pairing...
[one-shot-pair] Pairing approved successfully!
[one-shot-pair]   - deviceId: auto-pair-...
[one-shot-pair]   - deviceToken: token-...
[one-shot-pair]   - role: operator
[one-shot-pair] Invite code usage updated: test-auto-pair-... 0 -> 1
```

---

### 2.2 测试场景 2：无效邀请码

**测试目标**：验证无效邀请码的处理逻辑

**前置条件**：
- OpenClaw Gateway 正在运行
- 使用不存在或已过期的邀请码

**测试步骤**：

1. **访问 Control UI URL**
   ```
   http://127.0.0.1:18789/control-ui/?inviteCode=invalid_code_12345&session=main
   ```

2. **观察页面行为**

3. **查看浏览器控制台和 Network 面板**

**预期结果**：

| 验证项 | 预期结果 |
|--------|----------|
| tempToken 获取 | 返回 401 错误 |
| 错误信息 | "invalid or expired invite code" |
| 页面行为 | 不进行自动配对，显示错误提示 |
| 无 WebSocket 连接 | Network 面板无 WS 连接 |

**浏览器控制台预期日志**：
```
[auto-pair] Detected inviteCode: invalid_code_12345
[auto-pair] Fetching tempToken...
[auto-pair] Error: invalid or expired invite code
[auto-pair] Auto-pair aborted
```

---

### 2.3 测试场景 3：tempToken 过期使用

**测试目标**：验证临时凭证的过期处理

**前置条件**：
- OpenClaw Gateway 正在运行
- 已生成有效的邀请码

**测试步骤**：

1. **访问 Control UI URL**
   ```
   http://127.0.0.1:18789/control-ui/?inviteCode=<INVITE_CODE>&session=main
   ```

2. **等待 6 分钟（超过 5 分钟有效期）**

3. **刷新页面**

4. **观察行为**

**预期结果**：

| 验证项 | 预期结果 |
|--------|----------|
| 第一次访问 | tempToken 获取成功 |
| 刷新页面后 | 如果使用缓存的 tempToken，连接应失败 |
| 错误类型 | tempToken 已过期或已使用 |

**注意**：由于 tempToken 是一次性使用的，即使刷新页面，脚本也会重新获取新的 tempToken，所以此场景主要验证后端 tempToken 的过期逻辑。

---

### 2.4 测试场景 4：重复配对（已有设备 token）

**测试目标**：验证已配对设备的处理逻辑

**前置条件**：
- OpenClaw Gateway 正在运行
- 浏览器已保存有效的设备 token

**测试步骤**：

1. **确认 localStorage 已有设备 token**
   ```javascript
   // 浏览器控制台
   console.log(localStorage.getItem('openclaw.device.auth.v1'));
   // 应显示已保存的 token 信息
   ```

2. **再次访问 Control UI URL**
   ```
   http://127.0.0.1:18789/control-ui/?inviteCode=<INVITE_CODE>&session=main
   ```

3. **观察行为**

**预期结果**：

| 验证项 | 预期结果 |
|--------|----------|
| 页面加载 | 检测到已有设备 token |
| 自动配对 | 可能跳过（如果已配对）或返回 `alreadyPaired: true` |
| 最终行为 | 正常进入 Control UI 主界面 |

---

### 2.5 测试场景 5：邀请码达到使用次数上限

**测试目标**：验证邀请码使用次数限制的逻辑

**前置条件**：
- OpenClaw Gateway 正在运行
- 已生成 maxUses=1 的邀请码
- 已完成一次配对

**测试步骤**：

1. **修改邀请码配置**
   ```bash
   # 编辑 ~/.openclaw/invite-codes.json
   # 将某个邀请码的 maxUses 改为 1
   ```

2. **完成第一次配对**（使用场景 1 的步骤）

3. **再次尝试配对**

**预期结果**：

| 验证项 | 预期结果 |
|--------|----------|
| 第一次配对 | 成功 |
| 第二次配对 | 失败，返回 401 错误 |
| 错误信息 | "max_uses_reached" |

---

### 2.6 测试场景 6：WebSocket 代理连接

**测试目标**：验证 WebSocket 代理功能正常

**前置条件**：
- OpenClaw Gateway 正在运行
- 已生成有效的邀请码

**测试步骤**：

1. **访问 Control UI URL**

2. **打开浏览器 Network 面板，筛选 WebSocket**

3. **观察连接 URL**

**预期结果**：

| 验证项 | 预期结果 |
|--------|----------|
| 连接 URL | 应包含 `/plugins/node-auto-register/ws-pair-connect?tempToken=xxx` |
| 连接状态 | Connected（绿色） |
| 消息传输 | 双向消息正常传输 |

---

## 3. 自动化测试脚本

### 3.1 API 测试脚本

创建测试文件 `test-api.sh`（或 Windows 的 `test-api.bat`）：

```bash
#!/bin/bash

GATEWAY_HOST="http://127.0.0.1:18789"
INVITE_CODE="<YOUR_INVITE_CODE>"

echo "=== Testing Invite-Pair API ==="

# Test 1: Get tempToken
echo "Test 1: Fetching tempToken..."
RESPONSE=$(curl -s "$GATEWAY_HOST/plugins/node-auto-register/api/invite-pair?inviteCode=$INVITE_CODE")
echo "Response: $RESPONSE"

# Check if tempToken is present
if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "✓ tempToken fetch successful"
    TEMP_TOKEN=$(echo "$RESPONSE" | grep -o '"tempToken":"[^"]*"' | cut -d'"' -f4)
    echo "tempToken: $TEMP_TOKEN"
else
    echo "✗ tempToken fetch failed"
    exit 1
fi

# Test 2: Invalid invite code
echo ""
echo "Test 2: Testing invalid invite code..."
RESPONSE=$(curl -s "$GATEWAY_HOST/plugins/node-auto-register/api/invite-pair?inviteCode=invalid_code")
echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q '"ok":false'; then
    echo "✓ Invalid code rejected correctly"
else
    echo "✗ Invalid code not rejected"
    exit 1
fi

echo ""
echo "=== All API tests passed ==="
```

### 3.2 邀请码管理测试

```bash
#!/bin/bash

echo "=== Testing Invite Code Management ==="

# List codes
echo "Test 1: Listing invite codes..."
node plugins/node-auto-register/scripts/manage-invite-codes.js list

# Generate new code
echo ""
echo "Test 2: Generating new invite code..."
node plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test-$(date +%s)

# Verify code file
echo ""
echo "Test 3: Verifying invite codes file..."
cat ~/.openclaw/invite-codes.json | jq 'keys'

echo ""
echo "=== Management tests completed ==="
```

## 4. 故障排查

### 4.1 问题：页面加载后无自动配对行为

**排查步骤**：

1. **检查注入脚本是否加载**
   ```javascript
   // 浏览器控制台
   console.log(typeof window.OPENCLAW_AUTO_PAIR_EXECUTED);
   // 应显示 'undefined'（首次加载）或脚本已执行的标志
   ```

2. **检查 inviteCode 参数**
   ```javascript
   // 浏览器控制台
   console.log(new URLSearchParams(window.location.search).get('inviteCode'));
   ```

3. **检查 Network 请求**
   - 打开 Network 面板
   - 查找 `/plugins/node-auto-register/api/invite-pair` 请求
   - 查看请求状态和响应

4. **查看 Gateway 日志**
   - 查找 `[auto-pair]` 或 `[invite-pair]` 前缀的日志
   - 确认请求是否到达服务端

**常见问题**：
- 插件未正确加载
- 注入脚本路径错误
- 浏览器缓存了旧版本的 HTML

**解决方法**：
```bash
# 强制重新注入脚本
node plugins/node-auto-register/scripts/inject-auto-pair-script.js inject

# 或使用硬刷新（Ctrl+F5）
```

---

### 4.2 问题：tempToken 获取失败（401 错误）

**排查步骤**：

1. **验证邀请码是否存在**
   ```bash
   cat ~/.openclaw/invite-codes.json | jq 'keys'
   ```

2. **检查邀请码是否过期**
   ```bash
   cat ~/.openclaw/invite-codes.json | jq '.[] | {name: ., expiresAt: .expiresAt, now: (now * 1000)}'
   ```

3. **检查邀请码使用次数**
   ```bash
   cat ~/.openclaw/invite-codes.json | jq '.[] | {name: ., usedCount, maxUses}'
   ```

4. **手动测试 API**
   ```bash
   curl -v "http://127.0.0.1:18789/plugins/node-auto-register/api/invite-pair?inviteCode=YOUR_CODE"
   ```

---

### 4.3 问题：WebSocket 连接失败

**排查步骤**：

1. **检查 tempToken 是否有效**
   - tempToken 可能已过期或已使用

2. **查看 WebSocket 连接日志**
   - 浏览器 Network 面板查看 WS 连接状态
   - 查看 Gateway 日志中的连接信息

3. **手动测试 WebSocket**
   ```javascript
   // 浏览器控制台
   const ws = new WebSocket('ws://127.0.0.1:18789/plugins/node-auto-register/ws-pair-connect?tempToken=YOUR_TEMP_TOKEN');
   ws.onopen = () => console.log('Connected');
   ws.onerror = (e) => console.log('Error:', e);
   ws.onclose = () => console.log('Closed');
   ```

---

### 4.4 问题：配对后页面未刷新

**排查步骤**：

1. **检查自动配对 API 响应**
   ```javascript
   // 浏览器 Network 面板
   // 查看 /api/auto-pair 请求的响应
   ```

2. **检查 localStorage 是否保存**
   ```javascript
   console.log(localStorage.getItem('openclaw.device.auth.v1'));
   ```

3. **检查是否有 JavaScript 错误**
   - 浏览器控制台查看错误信息

---

### 4.5 问题：邀请码使用次数未增加

**排查步骤**：

1. **查看邀请码文件**
   ```bash
   cat ~/.openclaw/invite-codes.json
   ```

2. **检查 Gateway 日志**
   - 查找 `Invite code usage updated` 日志

3. **验证文件写入权限**
   ```bash
   ls -la ~/.openclaw/invite-codes.json
   ```

## 5. 测试检查清单

### 5.1 功能测试

- [ ] 正常配对流程完成
- [ ] 无效邀请码被拒绝
- [ ] 过期邀请码被拒绝
- [ ] 达到使用次数上限的邀请码被拒绝
- [ ] tempToken 一次性使用有效
- [ ] tempToken 过期后拒绝使用
- [ ] WebSocket 代理连接正常
- [ ] 设备 token 正确保存到 localStorage
- [ ] 页面刷新后自动登录

### 5.2 日志测试

- [ ] 浏览器控制台显示详细日志
- [ ] Gateway 日志显示配对流程
- [ ] 错误场景有明确的错误信息

### 5.3 边界测试

- [ ] 无 inviteCode 参数时的行为
- [ ] inviteCode 为空字符串时的行为
- [ ] 网络中断时的重试行为
- [ ] 多个待处理配对请求的处理

### 5.4 安全测试

- [ ] tempToken 无法被预测
- [ ] tempToken 验证后立即失效
- [ ] 邀请码文件权限正确
- [ ] WebSocket 连接需要有效 tempToken

## 6. 测试报告模板

```markdown
# 测试报告

## 测试日期
YYYY-MM-DD HH:MM

## 测试环境
- Node.js: vXX.X.X
- OpenClaw: vX.X.X
- 浏览器：Chrome/Firefox XX.X

## 测试结果

| 测试场景 | 状态 | 备注 |
|----------|------|------|
| 正常配对流程 | ✓/✗ | |
| 无效邀请码 | ✓/✗ | |
| tempToken 过期 | ✓/✗ | |
| 重复配对 | ✓/✗ | |
| 使用次数上限 | ✓/✗ | |
| WebSocket 代理 | ✓/✗ | |

## 发现的问题

1. [问题描述]
   - 复现步骤
   - 预期结果
   - 实际结果

## 建议

[改进建议]
```

## 7. 回归测试

每次修改 node-auto-register 插件后，应执行以下回归测试：

```bash
# 1. 重新生成邀请码
node plugins/node-auto-register/scripts/generate-control-ui-invite-code.js regression-test

# 2. 重启 Gateway
npm restart

# 3. 执行自动化 API 测试
./test-api.sh

# 4. 手动测试完整流程
# （参考场景 1）
```

## 8. 性能测试（可选）

### 8.1 并发配对测试

测试多个设备同时使用不同邀请码进行配对：

```bash
# 生成多个邀请码
for i in {1..10}; do
  node plugins/node-auto-register/scripts/generate-control-ui-invite-code.js "concurrent-$i"
done

# 使用自动化测试工具（如 k6）模拟并发请求
```

### 8.2 tempToken 服务性能

测试 tempToken 生成和验证的响应时间：

```bash
# 连续请求 100 次
for i in {1..100}; do
  time curl -s "http://127.0.0.1:18789/plugins/node-auto-register/api/invite-pair?inviteCode=TEST_CODE" > /dev/null
done
```

预期：平均响应时间 < 100ms
