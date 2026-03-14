# OpenClaw 多实例部署指南

本指南介绍如何在单台服务器上部署和管理多个 OpenClaw 实例。

## 目录

- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [端口分配](#端口分配)
- [实例管理](#实例管理)
- [清理实例](#清理实例)
- [故障排查](#故障排查)

## 快速开始

### 方式一：快速启动（无交互）

```bash
# 启动默认实例（端口 18789）
OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 启动自定义实例（端口 18889 = 18789 + 100）
OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_PORT_OFFSET=100 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 多实例部署（自动复用已构建的镜像，无需重复构建）
OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_PORT_OFFSET=100 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh
```

### 方式二：交互式启动

```bash
# 默认实例
./docker-setup.sh

# 自定义实例
OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_PORT_OFFSET=100 ./docker-setup.sh
```

### 方式三：使用命令行参数

```bash
# 跳过 onboarding
./docker-setup.sh --no-onboard

# 跳过镜像构建（复用已构建的镜像）
./docker-setup.sh --skip-build --no-onboard
```

## 环境变量

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `OPENCLAW_INSTANCE_ID` | 实例唯一标识 | `default` | `gw1`, `gw2`, `test` |
| `OPENCLAW_PORT_OFFSET` | 端口偏移量 | `0` | `100` (Gateway 端口=18889) |
| `OPENCLAW_NO_ONBOARD` | 跳过交互式配置 | `false` | `true` |
| `OPENCLAW_SKIP_BUILD` | 跳过镜像构建 | `false` | `true` (多实例复用镜像) |
| `OPENCLAW_CONFIG_DIR` | 配置目录路径 | `~/.openclaw-${INSTANCE_ID}` | `/opt/openclaw/gw1` |
| `OPENCLAW_WORKSPACE_DIR` | 工作空间目录 | `~/.openclaw-${INSTANCE_ID}/workspace` | - |
| `OPENCLAW_GATEWAY_PORT` | Gateway 端口 | `18789 + PORT_OFFSET` | `18889` |
| `OPENCLAW_BRIDGE_PORT` | Bridge 端口 | `18790 + PORT_OFFSET` | `18890` |
| `OPENCLAW_IMAGE` | Docker 镜像名 | `openclaw:local` | `openclaw:latest` |
| `OPENCLAW_SANDBOX` | 启用沙箱模式 | `false` | `1` |

## 端口分配

每个实例需要两个端口：

| 服务 | 基础端口 | 计算公式 | 示例（offset=100） |
|------|----------|----------|-------------------|
| Gateway | 18789 | 18789 + offset | 18889 |
| Bridge | 18790 | 18790 + offset | 18890 |

### 推荐端口规划

| 实例 ID | PORT_OFFSET | Gateway 端口 | Bridge 端口 | 用途 |
|---------|-------------|--------------|-------------|------|
| default | 0 | 18789 | 18790 | 主实例 |
| gw1 | 100 | 18889 | 18890 | 测试实例 1 |
| gw2 | 200 | 18989 | 18990 | 测试实例 2 |
| dev | 1000 | 19789 | 19790 | 开发实例 |

## 实例管理

使用 `manage-instances.sh` 脚本管理所有实例。

### 列出所有实例

```bash
./manage-instances.sh list
```

输出示例：
```
INSTANCE_ID          CONFIG_DIR           PORT            STATUS
-----------          ----------           ----            ------
default              /home/user/.openclaw 18789           running
gw1                  /home/user/.openclaw-gw1 18889       stopped
```

### 启动实例

```bash
./manage-instances.sh start gw1
```

### 停止实例

```bash
./manage-instances.sh stop gw1
```

### 重启实例

```bash
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

## 清理实例

使用 `cleanup-instance.sh` 脚本删除实例。

### 删除指定实例

```bash
# 删除实例（包括配置文件）
./cleanup-instance.sh gw1

# 删除实例但保留配置文件
./cleanup-instance.sh gw1 --keep-data

# 强制删除（无需确认）
./cleanup-instance.sh gw1 --force
```

### 自定义目录路径

```bash
# 使用自定义配置目录删除实例
OPENCLAW_CONFIG_DIR=/data/openclaw-gw1/config \
OPENCLAW_WORKSPACE_DIR=/data/openclaw-gw1/workspace \
./cleanup-instance.sh gw1
```

### 删除所有实例

```bash
# 删除所有实例及其配置
./cleanup-instance.sh --all

# 删除所有实例但保留配置文件
./cleanup-instance.sh --all --keep-data
```

### 清理残留资源

```bash
# 清理孤立的网络和卷
./cleanup-instance.sh --prune

# 强制清理
./cleanup-instance.sh --prune --force
```

## 使用场景

### 场景一：多环境隔离

```bash
# 开发环境
OPENCLAW_INSTANCE_ID=dev OPENCLAW_PORT_OFFSET=1000 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 测试环境
OPENCLAW_INSTANCE_ID=test OPENCLAW_PORT_OFFSET=2000 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 生产环境
OPENCLAW_INSTANCE_ID=prod OPENCLAW_NO_ONBOARD=true ./docker-setup.sh
```

### 场景二：多租户部署

```bash
# 为不同客户创建独立实例
for customer in customer1 customer2 customer3; do
  offset=$((${#customer} * 100))
  OPENCLAW_INSTANCE_ID=$customer OPENCLAW_PORT_OFFSET=$offset OPENCLAW_NO_ONBOARD=true ./docker-setup.sh
done
```

### 场景三：A/B 测试

```bash
# 实例 A（旧配置）
OPENCLAW_INSTANCE_ID=instance-a OPENCLAW_PORT_OFFSET=100 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh

# 实例 B（新配置）
OPENCLAW_INSTANCE_ID=instance-b OPENCLAW_PORT_OFFSET=200 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh
```

## 故障排查

### 问题一：端口冲突

**症状**：容器启动失败，提示端口已被占用

**解决方案**：
```bash
# 检查端口占用
netstat -tlnp | grep 18789

# 使用不同端口偏移量重新启动
OPENCLAW_PORT_OFFSET=999 OPENCLAW_NO_ONBOARD=true ./docker-setup.sh
```

### 问题二：实例无法启动

**症状**：`manage-instances.sh start` 失败

**排查步骤**：
```bash
# 1. 检查实例是否存在
./manage-instances.sh list

# 2. 查看实例状态
./manage-instances.sh status <instance_id>

# 3. 查看详细日志
./manage-instances.sh logs <instance_id>

# 4. 检查配置文件
ls -la ~/.openclaw-<instance_id>/
```

### 问题三：配置文件丢失

**症状**：实例启动后无法连接

**解决方案**：
```bash
# 检查配置文件
cat ~/.openclaw-<instance_id>/openclaw.json

# 重新运行 onboarding
docker compose -f docker-compose.yml run --rm openclaw-cli onboard
```

### 问题四：Docker 网络残留

**症状**：删除实例后网络仍存在

**解决方案**：
```bash
# 清理残留网络
./cleanup-instance.sh --prune

# 或手动清理
docker network ls | grep openclaw-network
docker network rm openclaw-network-<instance_id>
```

## 高级配置

### 自定义配置目录

```bash
# 将配置存储在独立磁盘
OPENCLAW_CONFIG_DIR=/data/openclaw/gw1 \
OPENCLAW_WORKSPACE_DIR=/data/openclaw/gw1/workspace \
OPENCLAW_INSTANCE_ID=gw1 \
OPENCLAW_PORT_OFFSET=100 \
OPENCLAW_NO_ONBOARD=true \
./docker-setup.sh
```

### 自定义目录 + 跳过构建

```bash
# 第一次部署（构建镜像）
OPENCLAW_CONFIG_DIR=/data/openclaw/gw1/config \
OPENCLAW_WORKSPACE_DIR=/data/openclaw/gw1/workspace \
OPENCLAW_INSTANCE_ID=gw1 \
OPENCLAW_PORT_OFFSET=100 \
./docker-setup.sh

# 后续部署（自动检测镜像存在，跳过构建）
OPENCLAW_CONFIG_DIR=/data/openclaw/gw2/config \
OPENCLAW_WORKSPACE_DIR=/data/openclaw/gw2/workspace \
OPENCLAW_INSTANCE_ID=gw2 \
OPENCLAW_PORT_OFFSET=200 \
./docker-setup.sh
```

### 启用沙箱模式

```bash
OPENCLAW_SANDBOX=1 OPENCLAW_INSTANCE_ID=sandbox ./docker-setup.sh
```

### 使用命名卷

```bash
OPENCLAW_HOME_VOLUME=openclaw-gw1-data ./docker-setup.sh
```

### 额外挂载点

```bash
OPENCLAW_EXTRA_MOUNTS="/host/path:/container/path" ./docker-setup.sh
```

## 相关文档

- [Docker 部署脚本](docker-setup.sh) - 查看脚本注释了解详细用法
- [Docker Compose 配置](docker-compose.yml) - 容器编排配置
- [官方文档](https://docs.openclaw.ai/) - 更多使用指南
