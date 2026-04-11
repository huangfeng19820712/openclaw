# OpenClaw 节点邀请码自动注册 - 快速入门指南

## 概述

这个插件允许你通过**邀请码**的方式，让远程机器自动注册成为 OpenClaw 节点。

### 两种运行模式

| 模式 | 是否需要 OpenClaw | 支持功能 | 资源占用 |
|------|------------------|----------|----------|
| **轻量节点** | ❌ 不需要 | 系统命令、设备信息 | CPU <1%, 内存 ~30MB |
| **完整节点** | ✅ 需要 | 所有节点命令 | CPU 5-10%, 内存 ~200-500MB |

### 核心特点

- **无需修改 OpenClaw 源码** - 完全独立插件
- **邀请码自动配对** - 无需手动批准
- **自动重连和心跳保活**
- **支持所有节点命令**（完整节点模式）

---

## 架构说明

```
┌─────────────────────┐          ┌─────────────────────┐
│   Gateway Server    │          │   Invite Service    │
│   (OpenClaw)        │          │   (Standalone)      │
│   Port: 18789       │          │   Port: 18795       │
└──────────┬──────────┘          └──────────┬──────────┘
           │                                │
           │                                │
           └────────────────┬───────────────┘
                            │
                            │
                    ┌───────▼────────┐
                    │   Remote Node  │
                    │  (This Plugin) │
                    │                │
                    │  轻量节点模式：  │
                    │  只需 Node.js   │
                    │                │
                    │  完整节点模式：  │
                    │  需要 OpenClaw │
                    └────────────────┘
```

---

## 安装步骤

### 步骤 0: 检查 Node.js 版本

```bash
node --version
# 需要 >= 18.0.0
# 推荐 >= 20.0.0 (LTS)
```

如果版本过低，请升级：
- 使用 nvm: `nvm install 20`
- 或直接下载：https://nodejs.org/

### 步骤 1: 安装依赖

```bash
cd openclaw/plugins/node-auto-register
npm install
```

### 步骤 2: 在 Gateway 机器上启动邀请码验证服务

```bash
# 前台运行
node scripts/invite-code-server.js

# 或后台运行
nohup node scripts/invite-code-server.js > invite-server.log 2>&1 &

# 或使用 systemd (Linux)
sudo cp invite-code-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable invite-code-server
sudo systemctl start invite-code-server
```

### 步骤 3: 生成邀请码

```bash
node scripts/generate-invite-code.js my-node-1
```

输出示例：
```
============================================================
OpenClaw Invite Code Generated
============================================================
Code Name:    my-node-1
Invite Code:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Expires:      2026-03-19T12:00:00.000Z
Max Uses:     1
============================================================
```

### 步骤 4: 配置 Gateway 允许的命令

编辑 `config.yaml`，添加：

```yaml
gateway:
  nodes:
    allowCommands:
      # 基础命令（轻量节点支持）
      - system.run
      - system.notify
      - device.info
      - device.status

      # 扩展命令（完整节点支持）
      - browser.proxy
      - canvas.*
      - camera.*
      - screen.*
      - location.*
      - notifications.*
      - device.*
      - contacts.*
      - calendar.*
      - reminders.*
      - photos.*
      - motion.*
      - sms.*
```

### 步骤 5: 在远程节点上运行

#### 轻量节点模式（无需 OpenClaw）

```bash
# 复制插件到远程机器
scp -r node-auto-register user@remote:/opt/node-agent

# 在远程机器上安装依赖
cd /opt/node-agent
npm install

# 运行
node cli.js \
  --invite-code eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --gateway 192.168.1.100 \
  --port 18789 \
  --name "server-01"
```

#### 完整节点模式（需要 OpenClaw）

```bash
# 在已安装 OpenClaw 的机器上
cd openclaw/plugins/node-auto-register
npm install

node cli.js \
  --invite-code eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --gateway 192.168.1.100 \
  --port 18789 \
  --name "desktop-pc"
```

---

## 使用方法

### 基本用法

```bash
# 启动节点
node cli.js --invite-code <CODE> --gateway <HOST>

# 指定节点名称
node cli.js --invite-code <CODE> --gateway <HOST> --name "living-room-node"

# 指定验证服务地址（如果不是 localhost）
node cli.js --invite-code <CODE> --gateway <HOST> --verify-service-url http://192.168.1.100:18795
```

### 管理邀请码

```bash
# 列出所有邀请码
node scripts/manage-invite-codes.js list

# 查看某个邀请码详情
node scripts/manage-invite-codes.js info my-node-1

# 撤销邀请码
node scripts/manage-invite-codes.js revoke my-node-1

# 清理过期邀请码
node scripts/manage-invite-codes.js cleanup
```

### 作为服务运行

#### Linux (systemd)

创建服务文件 `/etc/systemd/system/openclaw-node.service`:

```ini
[Unit]
Description=OpenClaw Node Agent
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/node-auto-register
ExecStart=/usr/bin/node cli.js --invite-code YOUR_CODE --gateway your-gateway --port 18789
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable openclaw-node
sudo systemctl start openclaw-node
sudo systemctl status openclaw-node
```

#### macOS (launchd)

创建 `~/Library/LaunchAgents/com.openclaw.node.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.node</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/cli.js</string>
        <string>--invite-code</string>
        <string>YOUR_CODE</string>
        <string>--gateway</string>
        <string>your-gateway</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.openclaw.node.plist
```

#### Windows (任务计划程序)

创建 PowerShell 脚本 `start-node.ps1`:

```powershell
Set-Location "C:\node-auto-register"
& node cli.js --invite-code YOUR_CODE --gateway your-gateway --port 18789
```

使用任务计划程序设置为开机启动。

---

## 故障排查

### 连接失败

```bash
# 检查 Gateway 是否运行
curl http://gateway-host:18789/

# 检查验证服务是否运行
curl http://localhost:18795/health

# 检查网络连通性
telnet gateway-host 18789
```

### 邀请码无效

确认邀请码未过期且未被使用：
```bash
node scripts/manage-invite-codes.js list
```

### 命令执行失败

检查 Gateway 配置中的 `allowCommands` 是否包含所需命令：
```bash
cat ~/.openclaw/config.yaml | grep -A 30 "allowCommands"
```

### 查看日志

```bash
# 插件日志
tail -f /path/to/node-auto-register/*.log

# Gateway 日志
tail -f /path/to/openclaw/logs/*.log
```

---

## 安全建议

1. **邀请码保密**: 邀请码具有完整权限，请妥善保管
2. **设置过期时间**: 使用 `INVITE_EXPIRY_DAYS` 环境变量设置较短的过期时间
3. **限制使用次数**: 使用 `INVITE_MAX_USES=1` 限制每个邀请码只能使用一次
4. **使用 TLS**: 在生产环境中使用反向代理提供 TLS 加密连接
5. **网络隔离**: 建议在内部网络使用，或通过防火墙限制访问

---

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `INVITE_EXPIRY_DAYS` | 邀请码过期天数 | 7 |
| `INVITE_MAX_USES` | 最大使用次数 | 1 |
| `PROXY_PORT` | 代理端口 | 18795 |
| `OPENCLAW_DIR` | OpenClaw 配置目录 | ~/.openclaw |

---

## 功能支持对照表

### 轻量节点模式（无需 OpenClaw）

| 功能 | 命令 | 状态 |
|------|------|------|
| 执行系统命令 | `system.run` | ✅ |
| 系统通知 | `system.notify` | ✅ |
| 设备信息 | `device.info` | ✅ |
| 设备状态 | `device.status` | ✅ |

### 完整节点模式（需要 OpenClaw）

额外支持：

| 功能类别 | 命令数 | 示例 |
|----------|--------|------|
| Canvas UI | 8 | `canvas.eval`, `canvas.present` |
| 相机 | 3 | `camera.snap`, `camera.list` |
| 屏幕 | 1 | `screen.record` |
| 位置 | 1 | `location.get` |
| 通知 | 2 | `notifications.list` |
| 设备 | 4 | `device.health`, `device.permissions` |
| 联系人 | 2 | `contacts.search` |
| 日历 | 2 | `calendar.add` |
| 提醒 | 2 | `reminders.add` |
| 照片 | 1 | `photos.latest` |
| 运动 | 2 | `motion.activity` |
| 短信 | 1 | `sms.send` |

---

## 更多资源

- [完整文档](README.md)
- [配置示例](CONFIG.md)
