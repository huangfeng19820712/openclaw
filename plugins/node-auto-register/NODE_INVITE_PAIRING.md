# OpenClaw 节点通过邀请码配对指南

## 概述

本文档介绍如何使用邀请码将外部节点配对到 OpenClaw Gateway。

## 前置条件

1. Gateway 已部署并运行，且加载了 `node-auto-register` 插件
2. 已生成邀请码（使用 `generate-control-ui-invite-code.js` 脚本）

## 方式 1：使用 CLI 脚本（推荐）

最简单的配对方式，自动完成邀请码验证和节点启动：

```bash
cd /data/workspace/openclaw/plugins/node-auto-register

# 使用邀请码启动节点
node src/cli.js \
  --invite-code <你的邀请码> \
  --gateway <Gateway 主机 IP> \
  --port <Gateway 端口> \
  --name "<节点名称>"
```

### 示例

```bash
node src/cli.js \
  --invite-code UXIKsB5DY5sDx432Of7CHXAMS5yNCX6yFuAczW1hFIw \
  --gateway 192.168.90.6 \
  --port 18789 \
  --name "Build Node"
```

### 简写参数

```bash
node src/cli.js \
  -i UXIKsB5DY5sDx432Of7CHXAMS5yNCX6yFuAczW1hFIw \
  -g 192.168.90.6 \
  -p 18789 \
  -n "Build Node"
```

### 只获取 Token（不连接）

```bash
node src/cli.js \
  --invite-code <邀请码> \
  --gateway <Gateway IP> \
  --port <端口> \
  --dry-run
```

## 方式 2：手动两步操作

### 步骤 1：通过邀请码获取设备 Token

```bash
# 调用 one-shot-pair API
curl "http://<Gateway IP>:<端口>/plugins/node-auto-register/api/one-shot-pair?inviteCode=<邀请码>"
```

返回示例：
```json
{
  "ok": true,
  "paired": true,
  "deviceId": "abc123...",
  "deviceToken": "xyz789...",
  "role": "operator",
  "displayName": "Auto-Paired Device (Control UI)"
}
```

### 步骤 2：使用 Token 启动节点

```bash
openclaw node run \
  --host <Gateway IP> \
  --port <端口> \
  --display-name "<节点名称>" \
  --auth.token <设备 Token>
```

示例：
```bash
openclaw node run \
  --host 192.168.90.6 \
  --port 18789 \
  --display-name "Build Node" \
  --auth.token xyz789...
```

## 方式 3：使用启动脚本

```bash
node scripts/start-node-with-invite.js \
  --invite-code <邀请码> \
  --gateway <Gateway IP> \
  --port <端口> \
  --name "<节点名称>"
```

## 验证配对

配对成功后，在 Gateway 上查看日志：

```bash
docker logs <容器名> | grep -E "node|paired|connected"
```

或在 Control UI 中查看已连接的设备列表。

## 故障排除

### 1. 邀请码无效

错误：`Invalid or expired invite code`

解决：
- 检查邀请码是否正确
- 确认邀请码未过期
- 检查邀请码使用次数是否已达上限

### 2. Gateway 不可达

错误：`Gateway unreachable` 或 `fetch failed`

解决：
- 确认 Gateway 容器正在运行
- 检查防火墙设置
- 验证端口是否正确

### 3. 插件未加载

错误：`Plugin not loaded (node-auto-register)`

解决：
```bash
# 检查插件是否加载
docker logs <容器名> | grep node-auto-register

# 如果没有输出，重新部署实例
./deploy-instance-with-invite.sh <实例名>
```

## 完整部署流程

在服务器上执行：

```bash
# 1. 部署 Gateway 实例（带邀请码功能）
cd /data/workspace/openclaw
./deploy-instance-with-invite.sh product1

# 输出示例：
#   邀请码：UXIKsB5DY5sDx432Of7CHXAMS5yNCX6yFuAczW1hFIw
#   访问地址：http://192.168.90.6:18989/control-ui/?inviteCode=...

# 2. 在外部节点上使用邀请码启动
node /data/workspace/openclaw/plugins/node-auto-register/src/cli.js \
  --invite-code UXIKsB5DY5sDx432Of7CHXAMS5yNCX6yFuAczW1hFIw \
  --gateway 192.168.90.6 \
  --port 18989 \
  --name "Build Node"
```

## 相关脚本

- `scripts/generate-control-ui-invite-code.js` - 生成邀请码
- `scripts/manage-invite-codes.js` - 管理邀请码（列表、撤销）
- `src/cli.js` - 节点启动 CLI（支持邀请码）
- `scripts/start-node-with-invite.js` - 一键配对并启动脚本
