# Control UI 自动配对功能需求与功能点

## 功能概述

通过邀请码实现 Control UI 的自动设备配对，用户只需访问带 `inviteCode` 参数的 URL，系统自动完成设备配对并保存 token 到 localStorage。

## 功能点列表

### FP-001: 邀请码生成脚本支持端口偏移

**功能描述：**
`generate-control-ui-invite-code.js` 脚本生成的 Control UI 访问 URL 应支持端口偏移配置。

**当前问题：**
- 脚本硬编码端口为 18789
- 使用 `PORT_OFFSET` 环境变量时（如 gw1 实例 PORT_OFFSET=100），实际端口应为 18889
- 生成的 URL 端口错误，导致用户访问错误的地址

**需求：**
- 脚本应读取 `OPENCLAW_PORT_OFFSET` 环境变量
- 基础端口 18789 + PORT_OFFSET = 实际端口
- 示例：PORT_OFFSET=100 → 实际端口 18889

**验收标准：**
```bash
# 无偏移（默认）
OPENCLAW_PORT_OFFSET= node scripts/generate-control-ui-invite-code.js test
# 期望输出：http://127.0.0.1:18789/control-ui/?inviteCode=xxx

# 有偏移
OPENCLAW_PORT_OFFSET=100 node scripts/generate-control-ui-invite-code.js test
# 期望输出：http://127.0.0.1:18889/control-ui/?inviteCode=xxx
```

---

### FP-002: Control UI 页面自动注入配对脚本

**功能描述：**
当用户访问带 `inviteCode` 参数的 Control UI URL 时，页面应自动执行设备配对脚本。

**工作流程：**
1. 用户访问 `http://gateway:port/control-ui/?inviteCode=xxx&session=main`
2. 页面加载时，`inject-auto-pair.js` 脚本检测到 `inviteCode` 参数
3. 脚本调用 `/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx`
4. 服务器返回设备 token
5. 脚本保存 token 到 `localStorage`
6. 页面自动刷新，用户正常进入 Control UI

**验收标准：**
- 浏览器控制台显示配对日志
- Network 面板显示 API 调用成功（HTTP 200）
- localStorage 包含设备 token
- 页面自动刷新后正常显示 Control UI 主界面

---

### FP-003: 一键配对 API 服务

**功能描述：**
提供 HTTP API 用于一键完成设备配对，无需 WebSocket 连接。

**端点：**
```
GET /plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx
```

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| inviteCode | string | 是 | 邀请码 |

**响应格式（成功）：**
```json
{
  "ok": true,
  "paired": true,
  "deviceId": "auto-pair-1234567890-abc12345",
  "deviceToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "operator",
  "displayName": "Auto-Paired Device (Control UI)"
}
```

**响应格式（失败）：**
```json
{
  "ok": false,
  "error": "invalid or expired invite code"
}
```

**验收标准：**
- 有效邀请码返回设备 token
- 无效邀请码返回 401 错误
- 过期邀请码返回 401 错误
- 达到使用次数上限返回 401 错误

---

### FP-004: 邀请码验证与管理

**功能描述：**
提供邀请码验证和管理功能，支持生成、查看、撤销、清理邀请码。

**子功能：**

#### FP-004.1: 邀请码生成
- 生成唯一邀请码（32 字节 base64url 编码）
- 设置过期时间（默认 365 天）
- 设置最大使用次数（默认 999 次）
- 支持自定义名称和描述

#### FP-004.2: 邀请码验证
- 检查邀请码是否存在
- 检查邀请码是否激活
- 检查邀请码是否过期
- 检查使用次数是否达到上限

#### FP-004.3: 邀请码管理
- 列出所有邀请码
- 查看邀请码详情
- 撤销邀请码
- 清理过期邀请码

**验收标准：**
- 生成邀请码后文件 `~/.openclaw/invite-codes.json` 包含新记录
- 验证逻辑正确处理各种无效场景
- 管理脚本支持所有操作

---

### FP-005: 配对状态文件管理

**功能描述：**
正确管理设备配对状态文件，与 OpenClaw 核心保持一致。

**文件结构：**
```
~/.openclaw/
├── devices/
│   ├── pending.json    # 待处理的配对请求
│   └── paired.json     # 已配对的设备
└── invite-codes.json   # 邀请码列表
```

**验收标准：**
- `createPairingRequest` 写入 `devices/pending.json`
- `approveDevicePairing` 从 `pending.json` 读取，写入 `paired.json`
- 使用原子写入防止数据损坏
- 文件路径与 OpenClaw 核心一致

---

## 测试用例概览

| 测试用例 ID | 关联功能点 | 测试场景 |
|-------------|------------|----------|
| TC-001 | FP-001 | 端口偏移配置测试 |
| TC-002 | FP-002 | Control UI 自动配对流程测试 |
| TC-003 | FP-003 | 一键配对 API 测试 |
| TC-004 | FP-004 | 邀请码验证测试 |
| TC-005 | FP-005 | 配对状态文件测试 |

详细测试用例见 `test-cases.md` 文件。

---

## 修改方案概览

| 修改项 | 文件 | 修改类型 | 状态 |
|--------|------|----------|------|
| MC-001 | `scripts/generate-control-ui-invite-code.js` | 支持端口偏移 | ✅ 已完成 |
| MC-002 | `src/one-shot-pair-server.js` | 修复文件路径 | ✅ 已完成 |
| MC-003 | `src/inject-auto-pair.js` | 确保正确注入 | ✅ 已完成 |
| MC-004 | `src/index.js` | 确保服务注册 | ✅ 已完成 |

详细修改方案见 `modification-plan.md` 文件。
