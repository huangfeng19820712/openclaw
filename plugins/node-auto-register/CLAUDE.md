# Node Auto-Register Plugin Development Guide

## 插件说明

通过邀请码自动注册成为 OpenClaw 节点的轻量级插件。

## 架构

- **无需 OpenClaw** - 远程机器只需 Node.js 即可运行
- **轻量级代理** - 只支持基础命令执行和设备查询
- **邀请码配对** - 自动完成节点配对流程

## 文件结构

```
node-auto-register/
├── src/
│   ├── index.js                  # 插件入口
│   ├── cli.js                    # 命令行入口
│   ├── auto-pair-server.js       # Control UI 自动配对 HTTP API
│   ├── invite-pair-server.js     # 临时凭证获取 HTTP API
│   ├── temp-token-service.js     # 临时凭证生成和验证服务
│   └── inject-auto-pair.js       # 浏览器端自动配对脚本
├── scripts/
│   ├── generate-invite-code.js           # 邀请码生成器
│   ├── generate-control-ui-invite-code.js # Control UI 邀请码生成器
│   ├── manage-invite-codes.js            # 邀请码管理器
│   └── inject-auto-pair-script.js        # 手动注入脚本工具
└── docs/
    ├── README.md
    └── ...
```

## 两种运行模式

### 轻量节点（无需 OpenClaw）
支持命令：
- `system.run` - 执行系统命令
- `system.notify` - 系统通知
- `device.info` - 设备信息
- `device.status` - 设备状态

### 完整节点（需要 OpenClaw）
额外支持 Canvas、相机、屏幕、位置等完整功能。

## 开发注意事项

### Node.js 版本要求
- 最低：Node.js >= 18.0.0
- 推荐：Node.js >= 20.0.0 (LTS)

### 依赖
- `ws` - WebSocket 客户端
- `commander` - CLI 参数解析

### 协议
- WebSocket 连接到 Gateway (默认 ws://host:18789)
- 使用 `connect.answer` 帧进行认证
- 邀请码通过 `auth.token` 或 `auth.inviteCode` 传递

## Control UI 自动配对

### 工作原理

1. 用户访问 `http://gateway:18789/control-ui/?inviteCode=xxx&session=main`
2. 浏览器脚本获取临时凭证（5 分钟有效，一次性使用）
3. 建立 WebSocket 连接
4. 检测到 `device.pair.requested` 事件后自动批准
5. 保存设备 token 到 localStorage
6. 刷新页面并自动登录

### API 端点

- `GET /plugins/node-auto-register/api/invite-pair?inviteCode=xxx` - 获取临时凭证
- `GET /plugins/node-auto-register/api/auto-pair?inviteCode=xxx` - 自动批准配对

### 测试

```bash
# 生成 Control UI 邀请码
node scripts/generate-control-ui-invite-code.js test

# 访问生成的 URL（不需要 token 参数）
```

## 相关文档

- [完整 README](README.md)
- [快速入门](QUICKSTART.md)
- [Gateway 集成](GATEWAY_INTEGRATION.md)
