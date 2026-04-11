# Docker 多实例部署测试指南

---

**文档目的**：验证 OpenClaw Docker 部署后容器的 token 配置是否正确

**最后更新**：2026-03-23

**部署脚本**：
- `docker-instance-setup.sh` - 完整版部署脚本（支持邀请码、插件同步等）
- `docker-multi-instance-setup.sh` - 精简版部署脚本（仅 token 认证，推荐使用）

---

## 部署脚本选择

### 精简版（推荐）- docker-multi-instance-setup.sh

**适用场景**：
- 快速部署，无需邀请码功能
- 多实例隔离部署
- 简单 token 认证

**使用方式**：
```bash
# 单实例部署
OPENCLAW_NO_ONBOARD=true ./docker-multi-instance-setup.sh

# 多实例部署
OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_PORT_OFFSET=100 OPENCLAW_NO_ONBOARD=true ./docker-multi-instance-setup.sh

# 跳过镜像构建（复用已有镜像）
OPENCLAW_INSTANCE_ID=gw1 OPENCLAW_SKIP_BUILD=true ./docker-multi-instance-setup.sh
```

### 完整版 - docker-instance-setup.sh

**适用场景**：
- 需要邀请码配对功能
- 需要插件同步
- 需要 Sandbox 沙箱模式

---

## 修复内容 summary

### 问题根因
当使用 `NO_ONBOARD=true` 部署时，如果宿主机上的 `openclaw.json` 配置文件不存在，token 配置代码永远不会执行，导致容器没有 `gateway.auth.token` 信息。

### 修复方案
1. **确保配置文件存在**（第 662-664 行）：
   ```bash
   if [[ ! -f "$config_file" ]]; then
     echo '{}' > "$config_file"
   fi
   ```

2. **bind 配置与实际启动参数一致**（第 678 行）：
   ```javascript
   config.gateway.bind = '$OPENCLAW_GATEWAY_BIND';  // 之前硬编码为 'loopback'
   ```

3. **Windows Git Bash 兼容的 sed 命令**（第 684-693 行）：
   ```bash
   sed -i.bak "s/^OPENCLAW_GATEWAY_TOKEN=.*/..." "$ENV_FILE" 2>/dev/null || {
     # Windows 回退方案：使用临时文件
     local tmp_file; tmp_file="$(mktemp)"
     sed "s/^OPENCLAW_GATEWAY_TOKEN=.*/..." "$ENV_FILE" > "$tmp_file"
     mv "$tmp_file" "$ENV_FILE"
   }
   ```

---

## 测试步骤

### 1. 单实例部署测试（使用精简版脚本）

```bash
# 清理旧实例（如果有）
docker compose -f docker-compose.yml down --remove-orphans 2>/dev/null || true

# 部署新实例（NO_ONBOARD=true，快速启动）
OPENCLAW_NO_ONBOARD=true ./docker-multi-instance-setup.sh
```

**验证步骤**：

```bash
# 1. 检查容器是否正常运行
docker compose ps

# 2. 检查配置文件中是否有 token
cat /data/openclaw/openclaw_instances/default/openclaw.json | jq '.gateway.auth'

# 期望输出：
# {
#   "mode": "token",
#   "token": "<64 位十六进制字符串>"
# }

# 3. 检查 .env 文件是否持久化了 token
grep "OPENCLAW_GATEWAY_TOKEN" .env

# 4. 访问 Control UI（带 token 的 URL）
# http://127.0.0.1:18789/control-ui/?token=<从输出获取的 token>&session=main
```

---

### 2. 单实例部署测试（完整版脚本）

### 3. 多实例部署测试（使用精简版脚本）

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

**验证步骤**：

```bash
# 1. 检查两个实例的配置目录是否隔离
ls -la /data/openclaw/openclaw_instances/
# 应看到：default/ gw1/ gw2/

# 2. 检查 gw1 的 token
cat /data/openclaw/openclaw_instances/gw1/openclaw.json | jq '.gateway.auth'

# 3. 检查 gw2 的 token
cat /data/openclaw/openclaw_instances/gw2/openclaw.json | jq '.gateway.auth'

# 4. 验证两个 token 不同
echo "gw1 token:"
cat /data/openclaw/openclaw_instances/gw1/openclaw.json | jq -r '.gateway.auth.token'
echo "gw2 token:"
cat /data/openclaw/openclaw_instances/gw2/openclaw.json | jq -r '.gateway.auth.token'

# 5. 检查容器端口映射
docker compose ps --format "table {{.Name}}\t{{.Ports}}"

# 应看到：
# openclaw-gw1-gateway   0.0.0.0:18889->18789/tcp
# openclaw-gw2-gateway   0.0.0.0:18989->18789/tcp
```

---

### 4. 多实例部署测试（完整版脚本）

### 5. bind 配置一致性测试（使用精简版脚本）

```bash
# 使用 lan 模式部署
OPENCLAW_INSTANCE_ID=bind-test \
  OPENCLAW_GATEWAY_BIND=lan \
  OPENCLAW_NO_ONBOARD=true \
  ./docker-multi-instance-setup.sh

# 验证配置文件中的 bind 值
cat /data/openclaw/openclaw_instances/bind-test/openclaw.json | jq '.gateway.bind'
# 期望输出："lan"
```

```bash
# 使用 loopback 模式部署
OPENCLAW_INSTANCE_ID=loopback-test \
  OPENCLAW_GATEWAY_BIND=loopback \
  OPENCLAW_NO_ONBOARD=true \
  ./docker-multi-instance-setup.sh

# 验证配置文件中的 bind 值
cat /data/openclaw/openclaw_instances/loopback-test/openclaw.json | jq '.gateway.bind'
# 期望输出："loopback"
```

---

### 6. bind 配置一致性测试（完整版脚本）

### 7. Windows Git Bash 特殊测试（使用精简版脚本）

在 Windows Git Bash 中运行：

```bash
# 部署
OPENCLAW_NO_ONBOARD=true ./docker-multi-instance-setup.sh

# 检查 .env 文件（Windows 上 sed -i 可能有问题）
cat .env | grep OPENCLAW_GATEWAY_TOKEN

# 检查是否有 .bak 备份文件残留（应该被清理了）
ls -la .env.bak 2>/dev/null && echo "警告：备份文件未清理" || echo "正常：备份文件已清理"
```

---

### 8. Windows Git Bash 特殊测试（完整版脚本）

## 故障排查

### 问题 1：容器启动后 token 为空

```bash
# 检查容器日志
docker logs openclaw-gateway 2>&1 | grep -i "auth\|token"

# 手动检查配置文件挂载
docker exec openclaw-gateway cat /home/node/.openclaw/openclaw.json | jq '.gateway.auth'
```

**可能原因**：
- 配置文件在容器启动后才被写入
- 挂载路径权限问题（Windows Docker Desktop）

**解决方案**：
```bash
# 重启容器以重新加载配置
docker compose restart openclaw-gateway
```

### 问题 2：多实例端口冲突

```bash
# 检查端口占用
netstat -ano | findstr "18789 18889 18989"
```

**解决方案**：使用不同的 `PORT_OFFSET`

### 问题 3：配置文件权限问题（Windows）

```bash
# 在容器内修复权限
docker exec openclaw-gateway chown -R node:node /home/node/.openclaw
```

---

## 自动化测试脚本

### 精简版脚本测试

创建测试脚本 `test-docker-deployment.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Docker 多实例部署测试（精简版）==="

# 测试 1：单实例部署
echo "[测试 1] 单实例部署..."
OPENCLAW_INSTANCE_ID=test-single \
  OPENCLAW_NO_ONBOARD=true \
  ./docker-multi-instance-setup.sh

sleep 5

# 验证 token
TOKEN=$(cat /data/openclaw/openclaw_instances/test-single/openclaw.json | jq -r '.gateway.auth.token')
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "FAIL: token 未写入配置文件"
  exit 1
fi
echo "PASS: token 已写入 ($TOKEN)"

# 验证 bind 配置
BIND=$(cat /data/openclaw/openclaw_instances/test-single/openclaw.json | jq -r '.gateway.bind')
echo "PASS: bind 配置 = $BIND"

# 清理
docker compose -f docker-compose.yml -f docker-compose.extra.yml down --remove-orphans
rm -rf /data/openclaw/openclaw_instances/test-single

echo "=== 所有测试通过 ==="
```

### 完整版脚本测试

## 相关文档

- [多 Gateway 网关配置](./multiple-gateways.md)
- [Docker 部署脚本](../../docker-instance-setup.sh)
- [Docker 精简版部署脚本](../../docker-multi-instance-setup.sh)
- [配置文件说明](../config/openclaw.json.md)
