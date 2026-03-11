# OpenClaw 多实例部署指南

## 快速启动

### 启动第一个实例（默认）

```bash
# 方式 1：跳过 onboarding，直接启动 gateway
OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 方式 2：使用 --no-onboard 参数
./docker-setup.sh --no-onboard
```

### 启动多个实例

在一台服务器上运行多个独立的 gateway 容器：

```bash
# 实例 1 - 端口 18789
OPENCLAW_INSTANCE_ID=gateway1 OPENCLAW_PORT_OFFSET=0 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 实例 2 - 端口 18889
OPENCLAW_INSTANCE_ID=gateway2 OPENCLAW_PORT_OFFSET=100 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 实例 3 - 端口 18989
OPENCLAW_INSTANCE_ID=gateway3 OPENCLAW_PORT_OFFSET=200 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh
```

## 环境变量说明

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `OPENCLAW_INSTANCE_ID` | `default` | 实例唯一标识，用于隔离配置目录 |
| `OPENCLAW_PORT_OFFSET` | `0` | 端口偏移量，Gateway 端口 = 18789 + offset |
| `OPENCLAW_NO_ONBOARD` | `false` | 是否跳过交互式 onboarding |
| `OPENCLAW_GATEWAY_TOKEN` | 自动生成 | Gateway 认证 token |
| `OPENCLAW_IMAGE` | `openclaw:local` | Docker 镜像名称 |
| `OPENCLAW_SANDBOX` | `false` | 是否启用沙箱模式 |

## 端口分配

| 实例 | INSTANCE_ID | PORT_OFFSET | Gateway 端口 | Bridge 端口 |
|------|-------------|-------------|--------------|-------------|
| 1 | gateway1 | 0 | 18789 | 18790 |
| 2 | gateway2 | 100 | 18889 | 18890 |
| 3 | gateway3 | 200 | 18989 | 18990 |
| n | gatewayN | N*100 | 18789+N*100 | 18790+N*100 |

## 配置目录

每个实例有独立的配置目录：

```
~/.openclaw-gateway1/   # 实例 1 配置
~/.openclaw-gateway2/   # 实例 2 配置
~/.openclaw-gateway3/   # 实例 3 配置
```

目录结构：
```
~/.openclaw-${INSTANCE_ID}/
├── openclaw.json        # 主配置文件
├── identity/            # 身份认证配置
└── agents/
    └── main/
        ├── agent/       # Agent 配置
        └── sessions/    # 会话数据
```

## 常用命令

### 查看实例状态

```bash
# 查看所有 openclaw 容器
docker ps --filter "name=openclaw"

# 查看指定实例日志
docker compose logs -f openclaw-gateway

# 查看容器运行状态
docker inspect openclaw-gateway-gateway1 | jq '.[0].State'
```

### 添加大模型

```bash
# Anthropic
docker compose exec openclaw-cli models add --provider anthropic --key sk-ant-xxx

# OpenAI
docker compose exec openclaw-cli models add --provider openai --key sk-xxx

# 查看已添加的模型
docker compose exec openclaw-cli models list
```

### 添加 Channel

```bash
# WhatsApp (扫码)
docker compose exec openclaw-cli channels login whatsapp

# Telegram (bot token)
docker compose exec openclaw-cli channels add --channel telegram --token <bot-token>

# Discord (bot token)
docker compose exec openclaw-cli channels add --channel discord --token <bot-token>

# 查看已添加的频道
docker compose exec openclaw-cli channels list
```

### 配置管理

```bash
# 查看当前配置
docker compose exec openclaw-cli config get

# 修改配置
docker compose exec openclaw-cli config set <key> <value>

# 查看 token
cat ~/.openclaw-gateway1/openclaw.json | grep token
```

### 停止/删除实例

```bash
# 停止实例
docker compose down

# 删除实例及数据
docker compose down -v
rm -rf ~/.openclaw-gateway1
```

## 使用示例

### 场景 1：单实例快速启动

```bash
cd /path/to/openclaw
OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 查看 token
cat ~/.openclaw-default/openclaw.json | grep token

# 添加模型
docker compose exec openclaw-cli models add --provider anthropic --key $ANTHROPIC_KEY
```

### 场景 2：多租户部署

```bash
# 为每个客户创建独立实例
for client in client1 client2 client3; do
  OPENCLAW_INSTANCE_ID=$client \
  OPENCLAW_PORT_OFFSET=$((100 * ${client#client})) \
  OPENCLAW_NO_ONBOARD=true \
  ./docker-setup.sh
done
```

### 场景 3：开发/生产环境分离

```bash
# 开发环境
OPENCLAW_INSTANCE_ID=dev OPENCLAW_PORT_OFFSET=0 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 生产环境
OPENCLAW_INSTANCE_ID=prod OPENCLAW_PORT_OFFSET=1000 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh
```

## 故障排查

### 端口冲突

如果端口被占用，修改 PORT_OFFSET：
```bash
OPENCLAW_PORT_OFFSET=300 ./docker-setup.sh
```

### 配置目录权限问题

```bash
# 修复配置目录权限
chown -R $(whoami) ~/.openclaw-*
```

### 容器无法启动

```bash
# 查看容器日志
docker compose logs openclaw-gateway

# 检查健康状态
docker inspect --format='{{.State.Health.Status}}' openclaw-gateway-<INSTANCE_ID>
```

## 相关文档

- [官方文档](https://docs.openclaw.ai/)
- [频道配置](https://docs.openclaw.ai/channels)
- [沙箱模式](https://docs.openclaw.ai/gateway/sandboxing)
