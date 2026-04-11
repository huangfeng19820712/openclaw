# Docker 多实例精简版部署脚本

---

**脚本位置**：`../../docker-multi-instance-setup.sh`

**适用场景**：
- 快速部署，无需邀请码功能
- 多实例隔离部署
- 简单 token 认证

---

## 快速开始

### 单实例部署

```bash
# 快速启动（NO_ONBOARD 模式）
OPENCLAW_NO_ONBOARD=true ./docker-multi-instance-setup.sh
```

部署完成后，输出类似：
```
==============================================
  OpenClaw 多实例部署完成
==============================================

实例信息:
  实例 ID:      default
  配置目录：    /data/openclaw/openclaw_instances/default
  工作空间：    /data/openclaw/openclaw_instances/default/workspace
  Gateway 端口：18789
  Bridge 端口：18790

访问信息:
  Gateway Token: <64 位十六进制字符串>

Control UI 访问 URL:
  http://127.0.0.1:18789/control-ui/?session=main

或使用带 token 的 URL:
  http://127.0.0.1:18789/control-ui/?token=<token>&session=main
```

### 多实例部署

```bash
# 实例 1：gw1（端口 18789 + 100 = 18889）
OPENCLAW_INSTANCE_ID=gw1 \
  OPENCLAW_PORT_OFFSET=100 \
  OPENCLAW_NO_ONBOARD=true \
  ./docker-multi-instance-setup.sh

# 实例 2：gw2（端口 18789 + 200 = 18989）
OPENCLAW_INSTANCE_ID=gw2 \
  OPENCLAW_PORT_OFFSET=200 \
  OPENCLAW_NO_ONBOARD=true \
  ./docker-multi-instance-setup.sh
```

### 复用已有镜像

```bash
# 跳过镜像构建（多实例部署时复用已构建的镜像）
OPENCLAW_INSTANCE_ID=gw3 \
  OPENCLAW_SKIP_BUILD=true \
  ./docker-multi-instance-setup.sh
```

---

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENCLAW_INSTANCE_ID` | 实例标识 | `default` |
| `OPENCLAW_INSTANCE_BASE_DIR` | 实例基础目录 | `/data/openclaw/openclaw_instances/` |
| `OPENCLAW_PORT_OFFSET` | 端口偏移量 | `0`（Gateway 端口 = 18789 + offset） |
| `OPENCLAW_NO_ONBOARD` | 是否跳过 onboarding | `false` |
| `OPENCLAW_SKIP_BUILD` | 是否跳过镜像构建 | `false` |
| `OPENCLAW_IMAGE` | Docker 镜像名 | `openclaw:local` |
| `OPENCLAW_GATEWAY_BIND` | 网关绑定地址 | `lan`（可选：`lan`/`loopback`） |

---

## 管理命令

### 查看日志

```bash
# 查看默认实例日志
docker compose -f docker-compose.yml -f docker-compose.extra.yml logs -f openclaw-gateway

# 查看指定实例日志（需要设置 COMPOSE_PROJECT_NAME）
COMPOSE_PROJECT_NAME="openclaw-gw1" docker compose logs -f openclaw-gateway
```

### 停止实例

```bash
# 停止默认实例
docker compose -f docker-compose.yml -f docker-compose.extra.yml down

# 停止指定实例
COMPOSE_PROJECT_NAME="openclaw-gw1" docker compose down
```

### 健康检查

```bash
# 检查默认实例
docker exec openclaw-default-openclaw-gateway-1 node dist/index.js health

# 检查 gw1 实例
docker exec openclaw-gw1-openclaw-gateway-1 node dist/index.js health
```

---

## 配置文件

### openclaw.json

位置：`$OPENCLAW_INSTANCE_BASE_DIR/$INSTANCE_ID/openclaw.json`

```json
{
  "gateway": {
    "auth": {
      "token": "<64 位十六进制字符串>",
      "mode": "token"
    },
    "bind": "lan",
    "controlUi": {
      "dangerouslyDisableDeviceAuth": true,
      "allowInsecureAuth": true
    }
  }
}
```

### .env 文件

位置：`./docker-multi-instance-setup.sh` 同级目录

```bash
OPENCLAW_CONFIG_DIR=/data/openclaw/openclaw_instances/default
OPENCLAW_WORKSPACE_DIR=/data/openclaw/openclaw_instances/default/workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_TOKEN=<64 位十六进制字符串>
OPENCLAW_IMAGE=openclaw:local
```

---

## 访问 Control UI

### 方式 1：带 token 的 URL（推荐）

```
http://127.0.0.1:18789/control-ui/?token=<token>&session=main
```

### 方式 2：先访问，再手动输入 token

1. 访问 `http://127.0.0.1:18789/control-ui/?session=main`
2. 在设置页面输入 gateway token

### 方式 3：URL token 参数（临时访问）

脚本已支持 URL 中的 `token` 参数，访问后会自动保存到 sessionStorage：

```
http://127.0.0.1:18789/control-ui/?token=<token>&session=main
```

---

## 与完整版脚本的区别

| 功能 | 精简版 | 完整版 |
|------|--------|--------|
| 多实例支持 | ✅ | ✅ |
| NO_ONBOARD 模式 | ✅ | ✅ |
| SKIP_BUILD 模式 | ✅ | ✅ |
| Token 认证 | ✅ | ✅ |
| 邀请码配对 | ❌ | ✅ |
| 插件同步 | ❌ | ✅ |
| Sandbox 沙箱模式 | ❌ | ✅ |
| Control UI 自动配对 | ❌ | ✅ |

**推荐使用精简版脚本**，除非你需要邀请码配对、插件同步等功能。

---

## 故障排查

### 问题 1：容器启动失败

```bash
# 查看容器日志
docker logs openclaw-default-openclaw-gateway-1

# 检查配置文件挂载
docker exec openclaw-default-openclaw-gateway-1 cat /home/node/.openclaw/openclaw.json
```

### 问题 2：Token 无法使用

```bash
# 检查配置文件中的 token
cat /data/openclaw/openclaw_instances/default/openclaw.json | jq '.gateway.auth'

# 重启容器
docker compose -f docker-compose.yml -f docker-compose.extra.yml restart openclaw-gateway
```

### 问题 3：端口冲突

```bash
# 检查端口占用
netstat -ano | findstr "18789"

# 使用不同的端口偏移
OPENCLAW_PORT_OFFSET=100 ./docker-multi-instance-setup.sh
```

### 问题 4：配置文件权限问题（Windows）

```bash
# 在容器内修复权限
docker exec openclaw-default-openclaw-gateway-1 chown -R node:node /home/node/.openclaw
```

---

## 相关文档

- [Docker 部署测试指南](./docker-deployment-test.md)
- [多 Gateway 网关配置](./multiple-gateways.md)
- [完整版部署脚本](../../docker-instance-setup.sh)
- [配置文件说明](../config/openclaw.json.md)
