# Control UI 自动配对功能测试用例

## 测试环境

| 组件 | 配置 | 说明 |
|------|------|------|
| Node.js | >= 18.0.0 | |
| OpenClaw | 最新版 | Docker 或本地部署 |
| 测试实例 | gw1 | PORT_OFFSET=100 |
| 基础端口 | 18789 | 无偏移时的默认端口 |
| 偏移后端口 | 18889 | PORT_OFFSET=100 时的实际端口 |

---

## TC-001: 端口偏移配置测试

**关联功能点：** FP-001

### 测试场景

验证 `generate-control-ui-invite-code.js` 脚本正确读取 `OPENCLAW_PORT_OFFSET` 环境变量并生成正确的端口。

### 前置条件

1. 已安装 Node.js >= 18.0.0
2. 已配置 OpenClaw 环境变量（可选）

### 测试步骤

#### 步骤 1：无端口偏移测试

```bash
cd /path/to/openclaw/plugins/node-auto-register
node scripts/generate-control-ui-invite-code.js test
```

**预期输出：**
```
生成 Control UI 邀请码:
  名称：test
  邀请码：<32 字符 inviteCode>
  访问 URL: http://127.0.0.1:18789/control-ui/?inviteCode=xxx&session=main
```

#### 步骤 2：有端口偏移测试

```bash
OPENCLAW_PORT_OFFSET=100 node scripts/generate-control-ui-invite-code.js test
```

**预期输出：**
```
生成 Control UI 邀请码:
  名称：test
  邀请码：<32 字符 inviteCode>
  访问 URL: http://127.0.0.1:18889/control-ui/?inviteCode=xxx&session=main
```

#### 步骤 3：不同偏移值测试

```bash
OPENCLAW_PORT_OFFSET=200 node scripts/generate-control-ui-invite-code.js test
```

**预期输出：**
```
访问 URL: http://127.0.0.1:18989/control-ui/?inviteCode=xxx&session=main
```

### 验收标准

| 检查项 | 期望值 | 实际值 | 状态 |
|--------|--------|--------|------|
| 无偏移时端口 | 18789 | | ⏳ |
| PORT_OFFSET=100 时端口 | 18889 | | ⏳ |
| PORT_OFFSET=200 时端口 | 18989 | | ⏳ |
| URL 格式正确 | 包含 inviteCode 参数 | | ⏳ |
| URL 格式正确 | 包含 session=main 参数 | | ⏳ |

---

## TC-002: Control UI 自动配对流程测试

**关联功能点：** FP-002

### 测试场景

验证用户访问带 `inviteCode` 参数的 Control UI URL 时，页面自动完成设备配对。

### 前置条件

1. OpenClaw Gateway 已启动
2. node-auto-register 插件已加载
3. 已生成有效邀请码

### 测试步骤

#### 步骤 1：生成邀请码

```bash
OPENCLAW_PORT_OFFSET=100 node scripts/generate-control-ui-invite-code.js test
```

记录输出的邀请码和访问 URL。

#### 步骤 2：浏览器访问 URL

在浏览器中访问生成的 URL：
```
http://127.0.0.1:18889/control-ui/?inviteCode=<INVITE_CODE>&session=main
```

#### 步骤 3：打开浏览器开发者工具

1. 打开 Network 面板
2. 打开 Console 面板
3. 打开 Application -> Local Storage

#### 步骤 4：观察自动配对行为

**预期行为：**
1. 页面加载时自动调用 `/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx`
2. API 返回 HTTP 200 和配对结果
3. localStorage 中保存设备 token
4. 页面自动刷新
5. 刷新后正常显示 Control UI 主界面

### 验收标准

| 检查项 | 期望值 | 实际值 | 状态 |
|--------|--------|--------|------|
| Network 中有一键配对 API 调用 | HTTP 200 | | ⏳ |
| API 响应包含 deviceId | 非空字符串 | | ⏳ |
| API 响应包含 deviceToken | JWT 格式 token | | ⏳ |
| localStorage 包含 openclaw.device.auth.v1 | 包含 token 信息 | | ⏳ |
| 页面自动刷新 | 配对完成后刷新 | | ⏳ |
| 刷新后 Control UI 正常显示 | 无登录提示 | | ⏳ |
| Console 中有配对日志 | [auto-pair] 开头 | | ⏳ |

---

## TC-003: 一键配对 API 测试

**关联功能点：** FP-003

### 测试场景

验证 `/plugins/node-auto-register/api/one-shot-pair` API 的各项功能。

### 前置条件

1. OpenClaw Gateway 已启动
2. node-auto-register 插件已加载
3. 已生成有效邀请码

### 测试步骤

#### 步骤 1：测试有效邀请码

```bash
INVITE_CODE="<生成的邀请码>"
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=$INVITE_CODE" | jq .
```

**预期响应：**
```json
{
  "ok": true,
  "paired": true,
  "deviceId": "auto-pair-<timestamp>-<uuid>",
  "deviceToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "operator",
  "displayName": "Auto-Paired Device (Control UI)"
}
```

#### 步骤 2：测试无效邀请码

```bash
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=invalid_code" | jq .
```

**预期响应：**
```json
{
  "ok": false,
  "error": "invalid or expired invite code"
}
```

#### 步骤 3：测试缺失邀请码参数

```bash
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair" | jq .
```

**预期响应：**
```json
{
  "ok": false,
  "error": "inviteCode is required"
}
```

#### 步骤 4：测试过期邀请码

1. 手动修改 `~/.openclaw/invite-codes.json`，将某个邀请码的 `expiresAt` 设置为过去时间
2. 调用 API

**预期响应：**
```json
{
  "ok": false,
  "error": "expired"
}
```

#### 步骤 5：测试达到使用次数上限

1. 手动修改 `~/.openclaw/invite-codes.json`，将某个邀请码的 `usedCount` 设置为等于 `maxUses`
2. 调用 API

**预期响应：**
```json
{
  "ok": false,
  "error": "max_uses_reached"
}
```

#### 步骤 6：验证配对状态文件

```bash
cat ~/.openclaw/devices/pending.json
cat ~/.openclaw/devices/paired.json
```

**预期结果：**
- `pending.json` 包含刚创建的配对请求（可能在批准后已被移除）
- `paired.json` 包含新配对的设备记录

### 验收标准

| 检查项 | 期望值 | 实际值 | 状态 |
|--------|--------|--------|------|
| 有效邀请码返回 200 | ok: true | | ⏳ |
| 有效邀请码返回 deviceId | 非空字符串 | | ⏳ |
| 有效邀请码返回 deviceToken | JWT 格式 | | ⏳ |
| 无效邀请码返回 401 | ok: false | | ⏳ |
| 缺失参数返回 400 | ok: false | | ⏳ |
| 过期邀请码拒绝 | error: "expired" | | ⏳ |
| 达到上限拒绝 | error: "max_uses_reached" | | ⏳ |
| pending.json 包含请求 | 正确的文件格式 | | ⏳ |
| paired.json 包含设备 | 包含 tokens 信息 | | ⏳ |

---

## TC-004: 邀请码验证测试

**关联功能点：** FP-004

### 测试场景

验证邀请码的生成、验证、管理功能。

### 测试步骤

#### 步骤 1：生成邀请码

```bash
node scripts/generate-control-ui-invite-code.js test
```

**验证：**
```bash
cat ~/.openclaw/invite-codes.json
```

#### 步骤 2：查看邀请码

```bash
node scripts/manage-invite-codes.js list
```

**预期输出：** 包含刚生成的邀请码信息

#### 步骤 3：撤销邀请码

```bash
node scripts/manage-invite-codes.js revoke test
```

**验证：** 邀请码状态变为 `active: false`

#### 步骤 4：验证已撤销的邀请码

```bash
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<已撤销的邀请码>" | jq .
```

**预期响应：**
```json
{
  "ok": false,
  "error": "invalid or expired invite code"
}
```

#### 步骤 5：清理过期邀请码

```bash
node scripts/manage-invite-codes.js cleanup
```

**预期输出：** 清理了多少个过期邀请码

### 验收标准

| 检查项 | 期望值 | 实际值 | 状态 |
|--------|--------|--------|------|
| 生成后 invite-codes.json 包含记录 | JSON 格式正确 | | ⏳ |
| 邀请码包含 code 字段 | 32 字符 base64url | | ⏳ |
| 邀请码包含 expiresAt 字段 | 时间戳 | | ⏳ |
| 邀请码包含 maxUses 字段 | 默认 999 | | ⏳ |
| 邀请码包含 usedCount 字段 | 初始 0 | | ⏳ |
| 撤销后 active: false | | | ⏳ |
| 已撤销邀请码验证失败 | | | ⏳ |

---

## TC-005: 配对状态文件测试

**关联功能点：** FP-005

### 测试场景

验证设备配对状态文件的正确管理。

### 前置条件

1. 删除现有状态文件（干净测试）
   ```bash
   rm -rf ~/.openclaw/devices/
   ```

### 测试步骤

#### 步骤 1：首次调用一键配对 API

```bash
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<有效邀请码>" | jq .
```

#### 步骤 2：检查 devices 目录结构

```bash
ls -la ~/.openclaw/devices/
```

**预期输出：**
```
total 16
drwxr-xr-x  2 user  staff   64 19 Mar 2026 .
drwxr-xr-x 10 user  staff  320 19 Mar 2026 ..
-rw-r--r--  1 user  staff  512 19 Mar 2026 paired.json
-rw-r--r--  1 user  staff  256 19 Mar 2026 pending.json
```

#### 步骤 3：检查 pending.json 内容

```bash
cat ~/.openclaw/devices/pending.json
```

**预期内容：**
- 空对象 `{}`（配对请求已批准并移除）
- 或包含刚创建的配对请求（如果未立即移除）

#### 步骤 4：检查 paired.json 内容

```bash
cat ~/.openclaw/devices/paired.json | jq .
```

**预期内容：**
```json
{
  "auto-pair-<timestamp>-<uuid>": {
    "deviceId": "auto-pair-<timestamp>-<uuid>",
    "publicKey": "auto-generated-key-...",
    "displayName": "Auto-Paired Device (Control UI)",
    "platform": "web",
    "deviceFamily": "browser",
    "clientId": "openclaw-control-ui",
    "clientMode": "webchat",
    "role": "operator",
    "scopes": ["control"],
    "tokens": {
      "operator": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "scopes": ["control"],
        "createdAtMs": <timestamp>
      }
    }
  }
}
```

#### 步骤 5：验证原子写入

1. 同时发起多个配对请求
2. 检查文件是否损坏

```bash
for i in {1..5}; do
  curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<有效邀请码>" &
done
wait
cat ~/.openclaw/devices/paired.json | jq .
```

**预期结果：** JSON 格式正确，所有设备都被记录

### 验收标准

| 检查项 | 期望值 | 实际值 | 状态 |
|--------|--------|--------|------|
| devices 目录自动创建 | | | ⏳ |
| pending.json 文件格式正确 | 有效 JSON | | ⏳ |
| paired.json 文件格式正确 | 有效 JSON | | ⏳ |
| paired.json 包含设备信息 | deviceId, tokens 等 | | ⏳ |
| 并发写入不损坏文件 | JSON 始终有效 | | ⏳ |
| 文件路径与 OpenClaw 核心一致 | devices/pending.json, devices/paired.json | | ⏳ |

---

## TC-006: 完整端到端测试

**关联功能点：** FP-001, FP-002, FP-003, FP-004, FP-005

### 测试场景

模拟真实用户使用 Control UI 自动配对的完整流程。

### 测试步骤

#### 步骤 1：管理员生成邀请码

```bash
OPENCLAW_PORT_OFFSET=100 node scripts/generate-control-ui-invite-code.js user1
```

记录输出的 URL，例如：
```
http://127.0.0.1:18889/control-ui/?inviteCode=xxx&session=main
```

#### 步骤 2：用户访问 URL

用户复制 URL 到浏览器访问。

#### 步骤 3：观察自动配对

1. 页面自动检测 inviteCode
2. 调用一键配对 API
3. 保存设备 token
4. 页面刷新

#### 步骤 4：验证登录状态

刷新后的页面应显示 Control UI 主界面，不需要手动登录。

#### 步骤 5：验证控制功能

尝试使用 Control UI 控制功能，确认 token 有效。

### 验收标准

| 检查项 | 期望值 | 实际值 | 状态 |
|--------|--------|--------|------|
| URL 生成正确 | 端口 18889 | | ⏳ |
| 页面自动检测 inviteCode | Console 有日志 | | ⏳ |
| API 调用成功 | HTTP 200 | | ⏳ |
| token 保存到 localStorage | | | ⏳ |
| 页面自动刷新 | | | ⏳ |
| 刷新后自动登录 | 无需手动输入 token | | ⏳ |
| 控制功能正常 | 可控制设备 | | ⏳ |

---

## 测试检查清单

完成所有测试后，填写以下清单：

| 测试用例 | 状态 | 备注 |
|----------|------|------|
| TC-001: 端口偏移配置测试 | ⏳ | |
| TC-002: Control UI 自动配对流程测试 | ⏳ | |
| TC-003: 一键配对 API 测试 | ⏳ | |
| TC-004: 邀请码验证测试 | ⏳ | |
| TC-005: 配对状态文件测试 | ⏳ | |
| TC-006: 完整端到端测试 | ⏳ | |

---

## 附录：常用测试命令

### 生成邀请码
```bash
OPENCLAW_PORT_OFFSET=100 node scripts/generate-control-ui-invite-code.js <name>
```

### 查看邀请码
```bash
node scripts/manage-invite-codes.js list
```

### 撤销邀请码
```bash
node scripts/manage-invite-codes.js revoke <name>
```

### 测试一键配对 API
```bash
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<CODE>" | jq .
```

### 查看设备配对状态
```bash
cat ~/.openclaw/devices/pending.json | jq .
cat ~/.openclaw/devices/paired.json | jq .
```

### 查看插件日志
```bash
docker logs openclaw-gw1-openclaw-gateway-1 --tail 50
```

### 清理测试数据
```bash
rm -rf ~/.openclaw/devices/
rm ~/.openclaw/invite-codes.json
```
