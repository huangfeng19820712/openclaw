
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
│   ├── one-shot-pair-server.js   # Control UI 一键配对 HTTP API
│   └── inject-auto-pair.js       # 浏览器端自动配对脚本
├── scripts/
│   ├── generate-invite-code.js           # 邀请码生成器
│   ├── generate-control-ui-invite-code.js # Control UI 邀请码生成器
│   ├── manage-invite-codes.js            # 邀请码管理器
│   └── inject-auto-pair-script.js        # 手动注入脚本工具
└── docs/
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

## 依赖
- `ws` - WebSocket 客户端
- `commander` - CLI 参数解析

## 协议
- WebSocket 连接到 Gateway (默认 ws://host:18789)
- 使用 `connect.answer` 帧进行认证
- 邀请码通过 `auth.token` 或 `auth.inviteCode` 传递

## Control UI 自动配对

### 工作原理

1. 用户访问 `http://gateway:18789/control-ui/?inviteCode=xxx&session=main`
2. 浏览器脚本调用一键配对 API
3. 服务器生成虚拟设备并批准配对
4. 返回设备 token 保存到 localStorage
5. 刷新页面并自动登录

### API 端点

- `GET /plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx` - 一键完成配对

### 测试

```bash
# 生成 Control UI 邀请码
node scripts/generate-control-ui-invite-code.js test

# 访问生成的 URL（不需要 token 参数）
```

## 相关文档

- [完整 README](README.md)
- [快速入门](QUICKSTART.md)
