# OpenClaw 节点邀请码配置示例

## 1. Gateway 配置文件 (config.yaml)

```yaml
# OpenClaw Gateway Configuration

gateway:
  # 基本配置
  host: "0.0.0.0"
  port: 18789

  # 节点配置
  nodes:
    # 允许的命令列表（full 权限）
    allowCommands:
      # 系统命令
      - system.run
      - system.notify
      - browser.proxy

      # Canvas 命令 (iOS/macOS)
      - canvas.present
      - canvas.hide
      - canvas.navigate
      - canvas.eval
      - canvas.snapshot
      - canvas.a2ui.push
      - canvas.a2ui.pushJSONL
      - canvas.a2ui.reset

      # 相机命令
      - camera.list
      - camera.snap
      - camera.clip

      # 屏幕录制
      - screen.record

      # 位置
      - location.get

      # 通知
      - notifications.list
      - notifications.actions

      # 设备信息
      - device.info
      - device.status
      - device.permissions
      - device.health

      # 联系人
      - contacts.search
      - contacts.add

      # 日历
      - calendar.events
      - calendar.add

      # 提醒事项
      - reminders.list
      - reminders.add

      # 照片
      - photos.latest

      # 运动传感器
      - motion.activity
      - motion.pedometer

      # 短信
      - sms.send

    # 可选：拒绝的命令（优先级高于 allowCommands）
    # denyCommands:
    #   - sms.send
    #   - camera.snap

# 认证配置
auth:
  # 如果使用共享密钥认证
  token: "your-gateway-auth-token"

# 工具配置（可选，用于控制节点上 exec 命令的权限）
tools:
  exec:
    # security: "full" 允许执行任何命令
    # security: "allowlist" 只允许 safeBins 中的命令
    # security: "deny" 禁止所有命令
    security: "full"

    # 当 security="allowlist" 时的安全命令列表
    # safeBins:
    #   - ls
    #   - cat
    #   - grep
    #   - find
    #   - uname
    #   - node
    #   - npm
```

## 2. 邀请码存储文件 (~/.openclaw/invite-codes.json)

```json
{
  "admin-node-1": {
    "code": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "createdAt": 1710234567890,
    "expiresAt": 1710839367890,
    "maxUses": 1,
    "usedCount": 0,
    "active": true,
    "description": "Admin workstation node"
  },
  "temp-access": {
    "code": "abc123xyz456...",
    "createdAt": 1710234567890,
    "expiresAt": 1710320967890,
    "maxUses": 5,
    "usedCount": 2,
    "active": true,
    "description": "Temporary access for contractor"
  }
}
```

## 3. 使用 systemd 管理节点服务 (Linux)

创建服务文件 `/etc/systemd/system/openclaw-node.service`:

```ini
[Unit]
Description=OpenClaw Node Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/openclaw/plugins/node-auto-register
ExecStart=/usr/bin/node cli.js --invite-code YOUR_INVITE_CODE --gateway your-gateway-host --port 18789
Restart=always
RestartSec=10

# 环境变量（可选）
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable openclaw-node
sudo systemctl start openclaw-node
sudo systemctl status openclaw-node
```

## 4. 使用 launchd 管理节点服务 (macOS)

创建 plist 文件 `~/Library/LaunchAgents/com.openclaw.node.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.node</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/openclaw/plugins/node-auto-register/cli.js</string>
        <string>--invite-code</string>
        <string>YOUR_INVITE_CODE</string>
        <string>--gateway</string>
        <string>your-gateway-host</string>
        <string>--port</string>
        <string>18789</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/openclaw-node.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/openclaw-node.err</string>
</dict>
</plist>
```

加载服务：
```bash
launchctl load ~/Library/LaunchAgents/com.openclaw.node.plist
```

## 5. 使用 Windows 任务计划程序

创建 PowerShell 脚本 `start-node.ps1`:

```powershell
$env:NODE_ENV = "production"
Set-Location "C:\path\to\openclaw\plugins\node-auto-register"
& node cli.js --invite-code YOUR_INVITE_CODE --gateway your-gateway-host --port 18789
```

使用任务计划程序设置为开机启动。

## 6. TLS/SSL 配置（生产环境推荐）

如果使用反向代理（如 nginx）提供 TLS：

```nginx
server {
    listen 443 ssl;
    server_name openclaw.example.com;

    ssl_certificate /etc/ssl/certs/openclaw.crt;
    ssl_certificate_key /etc/ssl/private/openclaw.key;

    location / {
        proxy_pass http://localhost:18789;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

然后在节点插件中使用：
```bash
node cli.js --invite-code YOUR_CODE --gateway wss://openclaw.example.com --port 443
```
