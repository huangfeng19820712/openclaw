# OpenClaw Node Auto-Register 使用指南

## 快速开始

> **注意**: 生成邀请码时如需设置多次使用，请在容器内执行命令：
> ```bash
> docker exec <container> sh -c 'INVITE_MAX_USES=999 node /home/node/.openclaw/extensions/node-auto-register/scripts/generate-invite-code.js <name>'
> ```

### 步骤 1: 生成邀请码

在 Gateway 服务器上运行：

```bash
# 进入 OpenClaw 目录
cd /data/openclaw/openclaw_instances/product1/extensions/node-auto-register

# 生成 Node 专用邀请码
node scripts/generate-invite-code.js my-node-1
```

输出示例：
```
邀请码已生成:
  名称：my-node-1
  代码：451EHgziMzfvSilhjfxCSLzVl4nQXve_3zllyTiQ4C4
  角色：node
  过期时间：7 天
  最大使用次数：1
```

### 步骤 2: 在节点上安装依赖

```bash
cd /path/to/node-auto-register
npm install
```

### 步骤 3: 连接节点

```bash
node cli.js \
  --invite-code 451EHgziMzfvSilhjfxCSLzVl4nQXve_3zllyTiQ4C4 \
  --gateway 192.168.90.6 \
  --port 18989 \
  --name "My-Server-01"
```

### 步骤 4: 验证连接

在 Gateway 服务器上运行验证脚本：

```bash
# 列出所有已配对的设备
node scripts/verify-pairing.js list

# 检查特定设备
node scripts/verify-pairing.js check <device-id>

# 检查邀请码状态
node scripts/verify-pairing.js check-invite 451EHgziMzfvSilhjfxCSLzVl4nQXve_3zllyTiQ4C4
```

---

## 完整使用方式

### CLI 参数说明

| 参数 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `-i, --invite-code` | 是 | 邀请码 | - |
| `-g, --gateway` | 否 | Gateway 主机地址 | localhost |
| `-p, --port` | 否 | Gateway 端口 | 18789 |
| `-n, --name` | 否 | 节点显示名称 | Auto-Paired Node |
| `--max-reconnect` | 否 | 最大重连次数 | 10 |
| `--dry-run` | 否 | 只显示配对结果，不连接 | false |

### 示例命令

```bash
# 基本用法
node cli.js --invite-code ABC123 --gateway 192.168.1.100 --port 18789

# 指定节点名称
node cli.js -i ABC123 -g 192.168.1.100 -p 18789 -n "Production-Server"

# 仅获取 token，不连接（用于后续手动启动）
node cli.js -i ABC123 -g 192.168.1.100 -p 18789 --dry-run

# 增加重连次数
node cli.js -i ABC123 -g 192.168.1.100 -p 18789 --max-reconnect 20
```

---

## 验证脚本使用

### verify-pairing.js 命令

```bash
# 列出所有已配对的设备
node scripts/verify-pairing.js list

# 列出设备 + 待处理请求 + 邀请码
node scripts/verify-pairing.js list --pending --invites

# 只显示待处理请求
node scripts/verify-pairing.js pending

# 只显示邀请码
node scripts/verify-pairing.js invites

# 检查特定设备
node scripts/verify-pairing.js check <device-id>

# 检查邀请码状态
node scripts/verify-pairing.js check-invite <invite-code>
```

### 输出示例

**list 命令输出：**
```
================================================================================
已配对的设备列表
================================================================================

[1] 📦 Auto-Paired Node
    Device ID:  faf39b5578c07e7a6bdb07998af4583b1680d275d5863ae4fe155cc73952f35f
    Client:     node-host (node)
    Role:       node
    Platform:   node / nodejs
    Scopes:     none
    Created:    2026-03-25 16:30:15
    Token:      Dwe3oVpOU74Br3kv2Vmu...

[2] 💻 Auto-Paired Device (Control UI)
    Device ID:  4c61138fe117031dc89ef924a9c0cda2fa07cd73f3c391bb46ab80c738a4e01b
    Client:     openclaw-control-ui (webchat)
    Role:       operator
    Platform:   web / browser
    Scopes:     control
    Created:    2026-03-25 12:15:59
    Token:      K7PUohWxJv_NXnTJo7Qh...
```

**check-invite 命令输出：**
```
================================================================================
邀请码详情
================================================================================

Name:         my-node-1
Code:         451EHgziMzfvSilhjfxCSLzVl4nQXve_3zllyTiQ4C4
Status:       ✅ 有效
Role:         node
Max Uses:     1
Used Count:   0
Remaining:    1
Expires:      2026-04-01 16:30:00
```

---

## 手工验证配对完成

### 方法 1: 检查配对文件

```bash
# 查看已配对设备列表
cat ~/.openclaw/devices/paired.json | jq '.'

# 查看待处理请求
cat ~/.openclaw/devices/pending.json | jq '.'
```

### 方法 2: 使用验证脚本

```bash
node scripts/verify-pairing.js list
```

### 方法 3: 检查 Gateway 日志

```bash
# Docker 容器
docker logs <container-name> 2>&1 | grep -E '(one-shot-pair|node-host|paired)'

# 查看最近的配对成功记录
docker logs <container-name> 2>&1 | grep 'Pairing approved'
```

### 方法 4: 测试节点连接

```bash
# 在节点上运行测试连接
cd /path/to/node-auto-register/src
timeout 10 node cli.js \
  --invite-code YOUR_CODE \
  --gateway YOUR_GATEWAY \
  --port 18789 \
  --name "Test-Node"

# 如果看到以下输出，表示连接成功：
# [NodeClient] Received: res
# [NodeClient] Success response: { type: 'hello-ok', ... }
```

---

## 作为服务运行

### Linux (systemd)

创建服务文件 `/etc/systemd/system/openclaw-node.service`:

```ini
[Unit]
Description=OpenClaw Node Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/data/openclaw/openclaw_instances/product1/extensions/node-auto-register
ExecStart=/usr/bin/node src/cli.js --invite-code YOUR_CODE --gateway localhost --port 18989 --name production-node
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# 启用并启动服务
sudo systemctl daemon-reload
sudo systemctl enable openclaw-node
sudo systemctl start openclaw-node

# 查看状态
sudo systemctl status openclaw-node

# 查看日志
sudo journalctl -u openclaw-node -f
```

### Windows (任务计划程序)

创建 `start-node.bat`:

```batch
@echo off
cd /d %~dp0
node src\cli.js --invite-code YOUR_CODE --gateway 192.168.1.100 --port 18789 --name windows-node
```

使用任务计划程序设置为开机启动。

---

## 故障排查

### 问题 1: 配对失败 "invalid invite code"

```bash
# 检查邀请码是否存在
node scripts/verify-pairing.js check-invite YOUR_CODE

# 检查邀请码是否过期
node scripts/manage-invite-codes.js list
```

### 问题 2: 连接失败 "pairing required"

这通常是因为设备元数据不匹配。确保：
- 配对时和连接时使用相同的 `clientId` 和 `clientMode`
- 配对时和连接时使用相同的 `platform` 值

### 问题 3: 连接失败 "device signature invalid"

检查：
- 公钥/私钥是否正确配对
- 签名载荷格式是否为 V3 格式
- nonce 是否使用服务器提供的值

### 问题 4: WebSocket 立即断开

```bash
# 检查 Gateway 日志
docker logs <container> 2>&1 | tail -50

# 查看具体错误原因
# 常见原因：
# - 1008 invalid request frame: 帧格式错误
# - 1008 pairing required: 设备未配对或元数据不匹配
# - 1008 device nonce mismatch: nonce 不一致
```

---

## 快速参考卡片

```bash
# ===== 服务器端命令 =====

# 生成邀请码
node scripts/generate-invite-code.js my-node

# 列出所有设备
node scripts/verify-pairing.js list

# 检查设备状态
node scripts/verify-pairing.js check <device-id>

# 检查邀请码
node scripts/verify-pairing.js check-invite <code>

# 列出邀请码
node scripts/verify-pairing.js invites

# 撤销邀请码
node scripts/manage-invite-codes.js revoke <name>

# ===== 客户端命令 =====

# 连接节点
node cli.js -i CODE -g GATEWAY -p PORT -n NAME

# 仅获取 token
node cli.js -i CODE -g GATEWAY -p PORT --dry-run

# ===== 验证连接 =====

# 在客户端测试连接 (10 秒超时)
timeout 10 node cli.js -i CODE -g GATEWAY -p PORT

# 在服务器端查看日志
docker logs <container> 2>&1 | grep -E '(paired|node-host|hello-ok)'
```

---

## 测试验证案例

### 完整测试流程（2026-03-25 验证通过）

**步骤 1: 生成邀请码（maxUses=999）**

```bash
docker exec openclaw-product1-openclaw-gateway-1 sh -c 'INVITE_MAX_USES=999 node /home/node/.openclaw/extensions/node-auto-register/scripts/generate-invite-code.js node-test-2'
```

输出：
```
============================================================
OpenClaw Invite Code Generated
============================================================
Code Name:    node-test-2
Invite Code:  OmcHFVkm4sJouXWj29CYM5_EnNOCKfwpXJKqWcQiD8w
Expires:      2026-04-01T15:32:37.039Z
Max Uses:     999
============================================================
```

**步骤 2: 测试 one-shot-pair API**

```bash
curl -s 'http://localhost:18989/plugins/node-auto-register/api/one-shot-pair?inviteCode=OmcHFVkm4sJouXWj29CYM5_EnNOCKfwpXJKqWcQiD8w&clientType=node'
```

响应：
```json
{
  "ok": true,
  "paired": true,
  "deviceId": "9d967666d2faeafbf9b85a34ce1b100d48fbb0297f11b10997673355f4823c32",
  "deviceToken": "upSCO-Jz0VzCtr6GOVvsbJg3NLPS6CgWA5NqLMUKSqs",
  "role": "node",
  "displayName": "Auto-Paired Node",
  "publicKey": "tnpdoWoutNZee_Sg...",
  "privateKey": "..."
}
```

**步骤 3: 测试节点连接**

```bash
cd /data/openclaw/openclaw_instances/product1/extensions/node-auto-register
timeout 5 node src/cli.js \
  --invite-code OmcHFVkm4sJouXWj29CYM5_EnNOCKfwpXJKqWcQiD8w \
  --gateway localhost \
  --port 18989 \
  --name Test-Node-1
```

成功输出关键信息：
```
[Step 1/2] Requesting device token via one-shot pair API...
[Pairing Success]
  Device ID:    9d967666d2faeafbf9b85a34ce1b100d48fbb0297f11b10997673355f4823c32
  Device Token: upSCO-Jz0VzCtr6G...
  Role:         node

[Step 2/2] Connecting to Gateway as node...
[NodeClient] WebSocket connected
[NodeClient] Received connect challenge, nonce: 69e5cb40...
[NodeClient] Sending connect request with device identity...
[NodeClient] Received: res
[NodeClient] Success response: { type: 'hello-ok', ... }
```

**步骤 4: 验证配对设备**

```bash
node scripts/verify-pairing.js list
```

输出：
```
================================================================================
已配对的设备列表
================================================================================

[6] 📦 Test-Node-1
    Device ID:  9d967666d2faeafbf9b85a34ce1b100d48fbb0297f11b10997673355f4823c32
    Client:     node-host (node)
    Role:       node
    Platform:   node / nodejs
    Scopes:     none
    Created:    3/25/2026, 11:38:52 PM
    Token:      upSCO-Jz0VzCtr6G...
    Last Used:  3/25/2026, 11:38:52 PM
```

**步骤 5: 检查 Gateway 日志**

```bash
docker logs openclaw-product1-openclaw-gateway-1 2>&1 | grep -E '(one-shot-pair|Pairing approved)'
```

输出：
```
2026-03-25T15:38:52.602+00:00 [one-shot-pair] Pairing approved successfully!
2026-03-25T15:38:52.604+00:00 [one-shot-pair]   - deviceId: 9d967666d2faeafbf9b85a34ce1b100d48fbb0297f11b10997673355f4823c32
2026-03-25T15:38:52.606+00:00 [one-shot-pair]   - deviceToken: upSCO-Jz0VzCtr6G...
2026-03-25T15:38:52.607+00:00 [one-shot-pair]   - role: node
```

---

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/plugins/node-auto-register/api/one-shot-pair` | GET | 一键配对 API |

### 一键配对 API 示例

```bash
# 请求
curl 'http://gateway:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx&clientType=node'

# 响应
{
  "ok": true,
  "paired": true,
  "deviceId": "...",
  "deviceToken": "...",
  "role": "node",
  "displayName": "Auto-Paired Node",
  "publicKey": "...",
  "privateKey": "..."
}
```
