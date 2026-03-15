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
│   ├── index.js          # 核心客户端逻辑
│   └── cli.js            # 命令行入口
├── scripts/
│   ├── generate-invite-code.js    # 邀请码生成器
│   ├── manage-invite-codes.js     # 邀请码管理器
│   ├── invite-code-proxy.js       # WebSocket 代理（可选）
│   └── invite-code-server.js      # 独立服务（旧方案）
└── docs/
    ├── README.md
    ├── QUICKSTART.md
    ├── CONFIG.md
    └── GATEWAY_INTEGRATION.md
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

## Gateway 集成

### 方案 1: 直接连接
Gateway 需要修改以支持邀请码验证（见 GATEWAY_INTEGRATION.md）

### 方案 2: 代理模式
运行 `invite-code-proxy.js`，无需修改 Gateway 源码。

## 测试

```bash
# 安装依赖
npm install

# 运行插件
node src/cli.js --invite-code TEST_CODE --gateway localhost --port 18789

# 生成测试邀请码
node scripts/generate-invite-code.js test
```

## 相关文档

- [完整 README](README.md)
- [快速入门](QUICKSTART.md)
- [Gateway 集成](GATEWAY_INTEGRATION.md)
