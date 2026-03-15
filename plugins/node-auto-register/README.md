# OpenClaw Node Auto-Register Plugin

通过邀请码自动注册成为 OpenClaw 节点，拥有完整操作权限。

## 核心特点

- **无需安装 OpenClaw** - 轻量级节点代理，仅依赖 Node.js
- **邀请码自动配对** - 无需手动批准，一键连接
- **只需一个端口** - 仅需开放 Gateway 端口 (18789)
- **自动重连机制** - 网络断开自动恢复
- **心跳保活** - 保持长连接稳定

---

## 两种运行模式

### 模式 A：轻量节点（无需 OpenClaw）⭐

远程机器**只需要 Node.js**，无需安装 OpenClaw。

**适用场景：**
- 远程控制服务器执行命令
- 批量部署自动化脚本
- 监控和运维任务

**支持功能：**

| 功能类别 | 命令 | 状态 |
|----------|------|------|
| 系统命令 | `system.run` | ✅ 完整支持 |
| 系统通知 | `system.notify` | ✅ 完整支持 |
| 设备信息 | `device.info` | ✅ 完整支持 |
| 设备状态 | `device.status` | ✅ 完整支持 |

**资源占用：**
- CPU: < 1%
- 内存: ~30MB
- 磁盘: ~5MB (含依赖)

---

### 模式 B：完整节点（需要 OpenClaw）

远程机器安装完整的 OpenClaw，本插件作为自动配对模块。

**适用场景：**
- 需要 Canvas UI 交互
- 需要访问相机/屏幕/传感器
- 需要完整的 OpenClaw 功能

**支持功能：**

| 功能类别 | 命令数 | 示例 |
|----------|--------|------|
| **系统命令** | 3 | `system.run`, `system.notify` |
| **Canvas UI** | 8 | `canvas.present`, `canvas.eval` |
| **相机** | 3 | `camera.snap`, `camera.list` |
| **屏幕** | 1 | `screen.record` |
| **位置** | 1 | `location.get` |
| **通知** | 2 | `notifications.list` |
| **设备** | 4 | `device.info`, `device.health` |
| **联系人** | 2 | `contacts.search` |
| **日历** | 2 | `calendar.events` |
| **提醒** | 2 | `reminders.list` |
| **照片** | 1 | `photos.latest` |
| **运动** | 2 | `motion.activity` |
| **短信** | 1 | `sms.send` |

**资源占用：**
- CPU: 5-10%
- 内存: ~200-500MB
- 磁盘: ~500MB (含 OpenClaw)

---

## 功能对比表

| 功能 | 轻量节点 | 完整节点 |
|------|----------|----------|
| 执行系统命令 | ✅ | ✅ |
| 系统通知 | ✅ | ✅ |
| 设备信息 | ✅ | ✅ |
| Canvas UI | ❌ | ✅ |
| 相机访问 | ❌ | ✅ |
| 屏幕录制 | ❌ | ✅ |
| 位置信息 | ❌ | ✅ |
| 通知管理 | ❌ | ✅ |
| 联系人/日历 | ❌ | ✅ |
| 照片访问 | ❌ | ✅ |
| 运动传感器 | ❌ | ✅ |
| 短信发送 | ❌ | ✅ |
| 资源占用 | 低 | 中 |
| 安装复杂度 | 简单 | 复杂 |

---

## 架构说明（简化方案）

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Host                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   OpenClaw 容器 (只需开放 18789 端口)                     │  │
│  │   ┌─────────────────────────────────────────────────┐ │  │
│  │   │   Gateway                                        │ │  │
│  │   │   Port: 18789                                    │ │  │
│  │   │   + 邀请码验证 (内置)                             │ │  │
│  │   └─────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                    │                                        │
│               18789:18789                                   │
└────────────────────┼─────────────────────────────────────────┘
                     │
                     ▼
           ┌───────────────────┐
           │    远程节点插件    │
           │  (使用邀请码连接)  │
           └───────────────────┘
```

**优势：**
- ✅ 只需开放一个端口 (18789)
- ✅ 无需修改 Gateway 源码（可选 Hook 脚本方案）
- ✅ 邀请码直接通过 WebSocket 传输

---

## 安装

### 前置要求

**轻量节点模式：**
```bash
# Node.js >= 18.0.0 (推荐 >= 20.0.0 LTS)
node --version

# 如果没有，安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

---

## 使用方法

### 方案 1: 直接连接（Gateway 已支持邀请码）

如果 Gateway 已经配置支持邀请码验证：

```bash
node cli.js \
  --invite-code eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --gateway 192.168.90.4 \
  --port 18789 \
  --name "server-01"
```

### 方案 2: 通过代理连接（无需修改 Gateway）

如果 Gateway 不支持邀请码，使用 Hook 脚本方案：

#### 步骤 1: 在 Gateway 容器内启动代理

```bash
# 进入容器
docker exec -it openclaw-container bash

# 启动邀请码代理
cd /data/openclaw/plugins/node-auto-register
node scripts/invite-code-proxy.js &
```

#### 步骤 2: 生成邀请码

```bash
node scripts/generate-invite-code.js server-01
```

#### 步骤 3: 远程节点通过代理连接

```bash
node cli.js \
  --invite-code eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --gateway 192.168.90.4 \
  --port 18789 \
  --use-proxy \
  --proxy-port 18795 \
  --name "server-01"
```

---

## CLI 参数

| 参数 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `--invite-code` | 是 | 邀请码 | - |
| `--gateway` | 否 | Gateway 主机地址 | localhost |
| `--port` | 否 | Gateway 端口 | 18789 |
| `--name` | 否 | 节点显示名称 | 主机名 |
| `--max-reconnect` | 否 | 最大重连次数 | 10 |
| `--use-proxy` | 否 | 使用代理模式 | false |
| `--proxy-port` | 否 | 代理端口 | 18795 |

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
User=your-user
WorkingDirectory=/path/to/node-auto-register
ExecStart=/usr/bin/node cli.js --invite-code YOUR_CODE --gateway your-gateway --port 18789 --name server-01
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

---

## 管理邀请码

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

---

## 故障排查

### 连接失败

```bash
# 检查 Gateway 是否可访问
curl http://gateway-host:18789/

# 检查网络连通性
telnet gateway-host 18789
```

### 邀请码无效

```bash
# 确认邀请码未过期
node scripts/manage-invite-codes.js list
```

### 远程无法访问 Control UI

如果远程访问 Control UI 提示 `origin not allowed`，需要修改 Gateway 配置：

```bash
# 允许所有来源（适合内网）
node scripts/enable-remote-ui.js

# 允许特定来源
node scripts/enable-remote-ui.js --origin http://your-remote-ip:3000
```

### 命令执行失败

```bash
# 检查 Gateway 配置
cat ~/.openclaw/config.yaml | grep -A 20 "allowCommands"
```

---

## 安全注意事项

1. **邀请码保密**: 邀请码具有完整权限，请妥善保管
2. **设置过期时间**: 使用 `INVITE_EXPIRY_DAYS` 设置较短的过期时间
3. **限制使用次数**: 使用 `INVITE_MAX_USES=1` 限制每个邀请码只能使用一次
4. **使用 TLS**: 生产环境建议使用反向代理提供 TLS 加密
5. **网络隔离**: 建议在内部网络使用，或通过防火墙限制访问

---

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `INVITE_EXPIRY_DAYS` | 邀请码过期天数 | 7 |
| `INVITE_MAX_USES` | 最大使用次数 | 1 |
| `PROXY_PORT` | 代理端口 | 18795 |
| `GATEWAY_PORT` | Gateway 端口 | 18789 |
| `OPENCLAW_DIR` | OpenClaw 配置目录 | ~/.openclaw |
| `GATEWAY_HOST` | Gateway 主机地址 | 127.0.0.1 |

---

## 更多资源

- [GATEWAY_INTEGRATION.md](GATEWAY_INTEGRATION.md) - Gateway 集成指南
- [QUICKSTART.md](QUICKSTART.md) - 快速入门
- [CONFIG.md](CONFIG.md) - 配置示例
