# Gateway 邀请码验证集成指南

## 概述

本方案让 Gateway 原生支持邀请码验证，节点插件可以直接使用邀请码连接，**无需额外的邀请码服务端口**。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Host                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   OpenClaw 容器 (只需开放 18789 端口)                     │  │
│  │   ┌─────────────────────────────────────────────────┐ │  │
│  │   │   Gateway                                        │ │  │
│  │   │   Port: 18789                                    │ │  │
│  │   │   + 邀请码验证 (内置)                             │ │  │
│  │   │                                                  │ │  │
│  │   │   1. 接收 connect.answer + inviteCode           │ │  │
│  │   │   2. 验证 inviteCode 是否有效                    │ │  │
│  │   │   3. 自动调用 node.pair.approve                 │ │  │
│  │   │   4. 建立连接                                    │ │  │
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

## Gateway 代码修改

### 需要修改的文件

1. `src/infra/node-pairing.ts` - 添加邀请码验证函数
2. `src/gateway/server-methods/nodes.ts` - 在 connect 处理中支持邀请码
3. `src/gateway/server/ws-connection/message-handler.ts` - 处理邀请码认证

---

### 修改 1: `src/infra/node-pairing.ts`

添加以下函数：

```typescript
/**
 * 验证邀请码并自动批准配对
 */
export async function verifyAndApproveWithInviteCode(
  inviteCode: string,
  nodeId: string,
  nodeInfo: {
    displayName?: string;
    platform?: string;
    version?: string;
    caps?: string[];
    commands?: string[];
  },
  baseDir?: string,
): Promise<{ ok: true; node: NodePairingPairedNode } | { ok: false; reason: string }> {
  const state = await loadState(baseDir);
  const codes = await loadInviteCodes(baseDir);
  const now = Date.now();

  // 查找有效的邀请码
  let foundCodeName: string | null = null;
  let codeData: any = null;

  for (const [name, data] of Object.entries(codes)) {
    if (!data.active) continue;
    if (data.code !== inviteCode) continue;
    if (data.expiresAt < now) continue;
    if (data.usedCount >= data.maxUses) continue;

    foundCodeName = name;
    codeData = data;
    break;
  }

  if (!foundCodeName || !codeData) {
    return { ok: false, reason: 'invalid_or_expired_invite_code' };
  }

  // 检查节点是否已经配对
  const existing = state.pairedByNodeId[nodeId];
  if (existing) {
    // 已经配对，直接返回成功
    return { ok: true, node: existing };
  }

  // 创建新的配对记录
  const node: NodePairingPairedNode = {
    nodeId,
    token: newToken(), // 生成节点长期 token
    displayName: nodeInfo.displayName,
    platform: nodeInfo.platform,
    version: nodeInfo.version,
    caps: nodeInfo.caps,
    commands: nodeInfo.commands,
    createdAtMs: now,
    approvedAtMs: now,
  };

  // 保存配对记录
  state.pairedByNodeId[nodeId] = node;
  await persistState(state, baseDir);

  // 更新邀请码使用次数
  await incrementInviteCodeUsage(foundCodeName, baseDir);

  return { ok: true, node };
}

/**
 * 加载邀请码列表
 */
async function loadInviteCodes(baseDir?: string): Promise<Record<string, any>> {
  const inviteCodePath = baseDir
    ? path.join(baseDir, 'invite-codes.json')
    : path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'invite-codes.json');

  try {
    const data = fs.readFileSync(inviteCodePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

/**
 * 增加邀请码使用次数
 */
async function incrementInviteCodeUsage(codeName: string, baseDir?: string): Promise<void> {
  const inviteCodePath = baseDir
    ? path.join(baseDir, 'invite-codes.json')
    : path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'invite-codes.json');

  let codes: Record<string, any> = {};
  try {
    const data = fs.readFileSync(inviteCodePath, 'utf-8');
    codes = JSON.parse(data);
  } catch (err) {
    // Ignore
  }

  if (codes[codeName]) {
    codes[codeName].usedCount = (codes[codeName].usedCount || 0) + 1;
    const dir = path.dirname(inviteCodePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(inviteCodePath, JSON.stringify(codes, null, 2), 'utf-8');
  }
}
```

---

### 修改 2: `src/gateway/server/ws-connection/message-handler.ts`

在 `connect.answer` 处理逻辑中，添加邀请码支持：

找到处理 `connect.answer` 的代码段，添加以下逻辑：

```typescript
// 检查是否使用邀请码
const inviteCode = params.auth?.inviteCode || params.auth?.token;

if (inviteCode && inviteCode.startsWith('ey')) {
  // 看起来像邀请码（base64url 格式）
  // 尝试用邀请码验证并自动批准
  const result = await verifyAndApproveWithInviteCode(inviteCode, deviceId, {
    displayName: clientInfo.displayName,
    platform: clientInfo.platform,
    version: clientInfo.version,
    caps: params.caps,
    commands: params.commands,
  });

  if (result.ok) {
    // 邀请码验证成功，设置配对 token
    params.auth.token = result.node.token;
    // 继续正常认证流程
  } else {
    // 邀请码无效，返回错误
    sendConnectError('INVALID_INVITE_CODE', result.reason);
    return;
  }
}
```

---

## Gateway 配置

### 1. 生成邀请码

在容器内运行：

```bash
docker exec -it openclaw-container node /path/to/plugins/node-auto-register/scripts/generate-invite-code.js my-node-1
```

### 2. 配置 config.yaml

```yaml
gateway:
  nodes:
    # 启用邀请码验证
    inviteCodeAuth:
      enabled: true
      # 邀请码文件路径
      codesPath: /root/.openclaw/invite-codes.json

    # 允许的命令
    allowCommands:
      - system.run
      - system.notify
      - device.info
      - device.status
```

---

## 使用流程

### 1. 在 Gateway 容器内生成邀请码

```bash
# 进入容器
docker exec -it openclaw-container bash

# 生成邀请码
node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js server-01
```

输出：
```
============================================================
OpenClaw Invite Code Generated
============================================================
Code Name:    server-01
Invite Code:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Expires:      2026-03-19T12:00:00.000Z
Max Uses:     1
============================================================
```

### 2. 在远程节点上运行插件

```bash
node cli.js \
  --invite-code eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --gateway 192.168.90.4 \
  --port 18789 \
  --name "server-01"
```

### 3. 验证连接

在 Gateway 上查看已连接的节点：

```bash
openclaw nodes status
```

---

## 最小化修改方案

如果你不想修改 Gateway 源码，还有一个**零代码修改方案**：

### 方案：在容器内运行一个小的 Hook 脚本

创建一个启动脚本，在 Gateway 启动前加载邀请码验证中间件：

```bash
#!/bin/bash
# start-gateway-with-invite-code.sh

# 1. 启动邀请码验证中间件（独立的 Node.js 进程）
node /data/openclaw/plugins/node-auto-register/scripts/invite-code-proxy.js &

# 2. 启动 Gateway
exec node src/gateway/server.js
```

`invite-code-proxy.js` 是一个小的 HTTP 代理，拦截 WebSocket 连接并处理邀请码。

---

## 总结

| 方案 | 代码修改 | 端口需求 | 推荐度 |
|------|----------|----------|--------|
| 直接修改 Gateway | 需要 | 18789 | ⭐⭐⭐ |
| Hook 脚本代理 | 不需要 | 18789 | ⭐⭐⭐⭐ |

**推荐使用 Hook 脚本方案**，因为：
- 不需要修改 Gateway 源码
- 只需一个端口
- 易于维护和升级
