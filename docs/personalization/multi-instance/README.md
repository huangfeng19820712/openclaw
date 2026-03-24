# OpenClaw Docker 多实例部署指南

---

## 概述

OpenClaw 支持在同一宿主机上部署多个独立实例，每个实例拥有：
- 独立的配置目录和数据空间
- 独立的端口（Gateway 和 Bridge）
- 独立的 Token 认证

**脚本位置**：
- 主部署脚本：`../../docker-instance-setup.sh`
- 管理脚本：`../../manage-instances.sh`
- 清理脚本：`../../cleanup-instance.sh`

---

## 目录结构

```
/data/openclaw/openclaw_instances/
├── default/          # 默认实例
│   ├── .env
│   ├── openclaw.json
│   └── workspace/
├── gw1/              # 实例 gw1
│   ├── .env
│   ├── openclaw.json
│   └── workspace/
├── gw2/              # 实例 gw2
│   └── ...
└── gw3/              # 实例 gw3
    └── ...
```

---

## 快速开始

### 部署默认实例

```bash
# 快速启动（NO_ONBOARD 模式，跳过交互式配置）
OPENCLAW_NO_ONBOARD=true ./docker-instance-setup.sh
```

### 部署自定义实例

```bash
# 方式 1：使用命令行参数（推荐）
./docker-instance-setup.sh gw1

# 方式 2：使用环境变量
OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_NO_ONBOARD=true ./docker-instance-setup.sh
```

### 多实例部署示例

```bash
# 实例 1：gw1（自动分配端口 18889）
./docker-instance-setup.sh gw1

# 实例 2：gw2（自动分配端口 18989）
./docker-instance-setup.sh gw2

# 实例 3：gw3（自动分配端口 19089）
./docker-instance-setup.sh gw3
```

---

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENCLAW_INSTANCE_ID` | 实例标识 | `default` |
| `OPENCLAW_INSTANCE_BASE_DIR` | 实例基础目录 | `/data/openclaw/openclaw_instances/` |
| `OPENCLAW_PORT_OFFSET` | 端口偏移量 | 自动分配（Gateway 端口 = 18789 + offset） |
| `OPENCLAW_NO_ONBOARD` | 是否跳过 onboarding | `false` |
| `OPENCLAW_SKIP_BUILD` | 是否跳过镜像构建 | `false` |
| `OPENCLAW_NEW_TOKEN` | 是否生成新 token | `false` |
| `OPENCLAW_IMAGE` | Docker 镜像名 | `openclaw:local` |
| `OPENCLAW_GATEWAY_BIND` | 网关绑定地址 | `lan`（可选：`lan`/`loopback`） |

---

## 命令行参数

```bash
./docker-instance-setup.sh [选项] [instance_id]

选项:
  <instance_id>    实例 ID（如 gw1, gw2, gw3）
  --no-onboard     跳过 onboarding
  --skip-build     跳过镜像构建
  --new-token      生成新 token
  --auto-port      强制自动分配端口偏移
```

---

## 自动端口分配

当使用命令行参数指定实例 ID 时（如 `./docker-instance-setup.sh gw2`），脚本会自动：

1. **检测已用端口**：
   - 检查运行中的 Docker 容器
   - 检查配置目录中已有实例的配置

2. **分配下一个可用端口**：
   - 按 +100 递增分配端口偏移
   - 例如：gw1=18889, gw2=18989, gw3=19089

3. **无需手动指定 `PORT_OFFSET`**

### 示例输出

```bash
$ ./docker-instance-setup.sh gw3

INFO: Using instance ID from argument: gw3
INFO: NO_ONBOARD mode enabled for argument-based deployment
INFO: Auto-detected port offset: 200 (Gateway port: 18989)
...
```

---

## 管理命令

使用 `manage-instances.sh` 脚本管理所有实例：

### 列出所有实例

```bash
./manage-instances.sh list
```

输出示例：
```
OpenClaw 实例列表:

INSTANCE_ID          CONFIG_DIR           PORT            STATUS
-----------          ----------           ----            ------
default              /data/openclaw/...   18789           running
gw1                  /data/openclaw/...   18889           running
gw2                  /data/openclaw/...   18989           stopped
```

### 启动/停止/重启实例

```bash
./manage-instances.sh start gw1
./manage-instances.sh stop gw1
./manage-instances.sh restart gw1
```

### 查看实例状态

```bash
./manage-instances.sh status gw1
```

### 查看实例日志

```bash
./manage-instances.sh logs gw1
```

### 重新部署实例

```bash
# 清理容器并重新部署（保留配置文件）
./manage-instances.sh redeploy gw1

# 重新部署并生成新 token
OPENCLAW_NEW_TOKEN=true ./manage-instances.sh redeploy gw1

# 重新部署并跳过镜像构建
OPENCLAW_SKIP_BUILD=true ./manage-instances.sh redeploy gw1
```

---

## 清理实例

### 清理单个实例

```bash
# 删除实例 gw1 的容器、网络和配置文件
./cleanup-instance.sh gw1

# 删除实例但保留配置文件
./cleanup-instance.sh gw1 --keep-data

# 强制删除，无需确认
./cleanup-instance.sh gw1 --force
```

### 清理所有实例

```bash
# 删除所有实例及其配置
./cleanup-instance.sh --all

# 删除所有容器但保留配置文件
./cleanup-instance.sh --all --keep-data
```

### 清理残留资源

```bash
# 清理孤立的 Docker 网络和卷
./cleanup-instance.sh --prune

# 强制清理
./cleanup-instance.sh --prune --force
```

---

## 访问 Control UI

部署完成后，脚本会输出访问信息：

```
Control UI 访问 URL:
  本地访问：http://127.0.0.1:18789/control-ui/?session=main
  局域网访问：http://192.168.90.6:18789/control-ui/?session=main

或使用带 token 的 URL:
  本地访问：http://127.0.0.1:18789/control-ui/?token=<token>&session=main
  局域网访问：http://192.168.90.6:18789/control-ui/?token=<token>&session=main
```

### 访问方式

| 方式 | URL | 说明 |
|------|-----|------|
| 带 token 的 URL | `http://host:port/control-ui/?token=<token>&session=main` | 推荐，自动保存 token |
| 手动输入 token | `http://host:port/control-ui/?session=main` | 首次访问后在设置页面输入 token |

---

## 配置文件

### 实例配置目录

每个实例有独立的配置目录：

```
/data/openclaw/openclaw_instances/<instance_id>/
├── .env              # 环境变量（端口、token 等）
├── openclaw.json     # Gateway 配置
└── workspace/        # 工作空间
```

### openclaw.json 示例

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

### .env 文件示例

```bash
OPENCLAW_CONFIG_DIR=/data/openclaw/openclaw_instances/gw1
OPENCLAW_WORKSPACE_DIR=/data/openclaw/openclaw_instances/gw1/workspace
OPENCLAW_GATEWAY_PORT=18889
OPENCLAW_BRIDGE_PORT=18890
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_TOKEN=<64 位十六进制字符串>
OPENCLAW_IMAGE=openclaw:local
```

---

## 常见场景

### 场景 1：快速部署测试环境

```bash
# 部署多个测试实例
./docker-instance-setup.sh test1
./docker-instance-setup.sh test2
./docker-instance-setup.sh test3
```

### 场景 2：为不同用户部署独立实例

```bash
# 用户 A 的实例
OPENCLAW_INSTANCE_ID=user-a ./docker-instance-setup.sh

# 用户 B 的实例
OPENCLAW_INSTANCE_ID=user-b ./docker-instance-setup.sh
```

### 场景 3：重置某个实例

```bash
# 重新部署实例（保留配置）
./manage-instances.sh redeploy gw1

# 完全清理后重新部署
./cleanup-instance.sh gw1
./docker-instance-setup.sh gw1
```

### 场景 4：批量管理

```bash
# 查看所有实例状态
./manage-instances.sh list

# 停止所有实例
for id in default gw1 gw2; do
  ./manage-instances.sh stop $id
done
```

---

## 故障排查

### 问题 1：端口冲突

```bash
# 检查端口占用
netstat -tlnp | grep 18789

# 手动指定端口偏移
OPENCLAW_PORT_OFFSET=500 ./docker-instance-setup.sh gw5
```

### 问题 2：容器启动失败

```bash
# 查看容器日志
docker logs openclaw-gw1-openclaw-gateway-1

# 检查配置文件
cat /data/openclaw/openclaw_instances/gw1/openclaw.json
```

### 问题 3：配置文件权限问题

```bash
# 修复配置文件权限
docker exec openclaw-gw1-openclaw-gateway-1 chown -R node:node /home/node/.openclaw
```

### 问题 4：实例无法启动

```bash
# 检查实例是否存在
./manage-instances.sh status gw1

# 查看实例详细状态
./manage-instances.sh logs gw1
```

---

## 相关文档

- [Docker 部署测试指南](./docker-deployment-test.md)
- [多 Gateway 网关配置](./multiple-gateways.md)
- [精简版部署脚本](./docker-multi-instance-setup.md)
- [配置文件说明](../config/openclaw.json.md)
