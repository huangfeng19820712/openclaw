# 测试报告 #004 - Node Auto-Register 一键配对功能

## 测试日期
2026-03-19

## 测试环境
| 组件 | 版本/状态 | 说明 |
|------|----------|------|
| Node.js | >= 18.0.0 | |
| OpenClaw | 最新版 (Docker 部署) | 提交 c6a32f09c |
| 测试服务器 | 192.168.90.6 | SSH 访问 |
| 实例配置 | gw1 | PORT_OFFSET=100 |
| 容器名称 | openclaw-gw1-openclaw-gateway-1 | |

---

## 部署流程测试

| 步骤 | 状态 | 说明 |
|------|------|------|
| 清理容器 | ✅ 通过 | `cleanup-instance.sh` 正常删除容器和配置目录 |
| 代码更新 | ✅ 通过 | `git pull` 成功获取最新提交 c6a32f09c |
| 重新部署 | ✅ 通过 | `docker-instance-setup.sh` 成功创建容器 |
| 容器运行 | ✅ 通过 | 容器正常启动并监听端口 |

### 部署日志摘要
```
Network openclaw-gw1_default Created
Container openclaw-gw1-openclaw-gateway-1 Started
Invite code generated: vlztSjZ0...h1xwLFdI
Auto-pair script injected successfully
```

---

## 插件加载测试

| 检查项 | 状态 | 日志输出 |
|--------|------|----------|
| 插件加载 | ✅ 通过 | `[node-auto-register] Plugin loaded` |
| 脚本注入 | ✅ 通过 | `Auto-pair script already injected` |
| API 注册 | ✅ 通过 | `[one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair` |

### 容器日志摘要
```
2026-03-19T09:31:57.547+00:00 [node-auto-register] Plugin loaded
2026-03-19T09:31:57.555+00:00 [one-shot-pair] === Registering one-shot pair server ===
2026-03-19T09:31:57.557+00:00 [one-shot-pair] Server registered at /plugins/node-auto-register/api/one-shot-pair
2026-03-19T09:31:57.562+00:00 [one-shot-pair] === One-shot pair server registration complete ===
```

---

## 功能测试

### 1. 邀请码验证测试

| 测试项 | 输入 | 预期结果 | 实际结果 | 状态 |
|--------|------|----------|----------|------|
| 有效邀请码 | `vlztSjZ0...` | 验证通过 | 验证成功 | ✅ |
| 无效邀请码 | `invalid_code_xyz` | 返回 401 错误 | 返回 401 | ✅ |

**API 响应示例（有效邀请码）：**
```
[one-shot-pair] Code " control-ui " validation successful
[one-shot-pair]   - Expires: 2027-03-19T09:31:52.201Z
[one-shot-pair]   - Max uses: 999
[one-shot-pair]   - Current uses: 0
```

**API 响应示例（无效邀请码）：**
```json
{"ok":false,"error":"invalid or expired invite code"}
```

---

### 2. 一键配对 API 测试 - 正常流程

**请求：**
```
GET /plugins/node-auto-register/api/one-shot-pair?inviteCode=vlztSjZ0xU9bWXgtXQPXj8f5AMD8GhEOdxNh1xwLFdI
```

**响应：**
```json
{
  "ok": true,
  "paired": true,
  "deviceId": "auto-pair-1773912753601-2a31af81",
  "deviceToken": "iwcpY3Y6NvESAIEvblIWUJJzdN9UtKNNeEm0222BzK4",
  "role": "operator",
  "displayName": "Auto-Paired Device (Control UI)"
}
```

**状态：** ✅ **通过**

**完整日志：**
```
[one-shot-pair] === One-shot pair request received ===
[one-shot-pair] Invite code validation successful, code name: control-ui
[one-shot-pair] Generated virtual device: auto-pair-1773912753601-2a31af81
[one-shot-pair] Pairing request created: req-1773912753604-c522dd06
[one-shot-pair] Pairing approved successfully!
[one-shot-pair]   - deviceId: auto-pair-1773912753601-2a31af81
[one-shot-pair]   - deviceToken: iwcpY3Y6NvESAIEv...
[one-shot-pair]   - role: operator
[one-shot-pair] Invite code usage updated: control-ui 0 -> 1
[one-shot-pair] === One-shot pair request completed ===
```

---

### 3. 重复配对测试

**测试目标：** 验证同一邀请码可以多次使用（maxUses=999）

**响应：**
```json
{
  "ok": true,
  "paired": true,
  "deviceId": "auto-pair-1773912788104-bb64a76e",
  "deviceToken": "ZmwFBOJ-34q0AzWhba8oOrLOAGSF3omiz5OTz-l_H0E",
  "role": "operator",
  "displayName": "Auto-Paired Device (Control UI)"
}
```

**状态：** ✅ **通过**

---

### 4. 设备持久化测试

**检查配对设备文件：**
```json
{
  "auto-pair-1773912753601-2a31af81": {
    "deviceId": "auto-pair-1773912753601-2a31af81",
    "displayName": "Auto-Paired Device (Control UI)",
    "platform": "web",
    "deviceFamily": "browser",
    "role": "operator",
    "tokens": {
      "operator": {
        "token": "iwcpY3Y6NvESAIEvblIWUJJzdN9UtKNNeEm0222BzK4",
        "role": "operator",
        "scopes": ["control"]
      }
    }
  }
}
```

**状态：** ✅ **通过** - 设备信息正确保存到 `/home/node/.openclaw/devices/paired.json`

---

## 测试历史对比

| 测试轮次 | 提交版本 | 状态 | 主要问题 |
|----------|---------|------|----------|
| #001 | f13c38d68 | ❌ 失败 | `device-pairing functions not available` |
| #002/#003 | f858eb65a | ⚠️ 部分通过 | `approveDevicePairing` 缺少 `baseDir` 参数 |
| #004 | c6a32f09c | ✅ **通过** | 所有测试通过 |

### 进展总结

| 功能 | #001 | #002 | #004 |
|------|------|------|------|
| 插件加载 | ✅ | ✅ | ✅ |
| 邀请码验证 | ✅ | ✅ | ✅ |
| device-pairing 导入 | ❌ | ✅ | ✅ |
| 配对请求创建 | ❌ | ✅ | ✅ |
| 配对批准 | ❌ | ❌ | ✅ |
| 设备持久化 | ❌ | ❌ | ✅ |

---

## 测试检查清单

| 测试场景 | 状态 | 备注 |
|----------|------|------|
| 部署流程 | ✅ | 清理、更新、部署均正常 |
| 插件加载 | ✅ | 插件正确加载并注册 HTTP 路由 |
| 邀请码验证 | ✅ | 有效/无效邀请码正确处理 |
| 一键配对 API | ✅ | 完整流程正常工作 |
| 无效邀请码拒绝 | ✅ | 返回 401 错误 |
| 重复配对 | ✅ | 邀请码可多次使用 |
| 设备持久化 | ✅ | 配对设备正确保存 |
| Control UI 访问 | ✅ | 页面正常加载 |

---

## 结论

| 类别 | 状态 |
|------|------|
| 部署测试 | ✅ 通过 |
| 插件加载测试 | ✅ 通过 |
| 功能测试 | ✅ **全部通过** |

**最终结果：** 一键配对功能已完全修复并正常工作！

**修复内容（提交 c6a32f09c）：**
1. 添加了 `baseDir` 参数调用 `approveDevicePairing(requestId, baseDir)`
2. 使用正确的 pending 文件路径 `/home/node/.openclaw/devices/pending.json`

**API 响应示例：**
```json
{
  "ok": true,
  "paired": true,
  "deviceId": "auto-pair-xxx",
  "deviceToken": "xxx",
  "role": "operator",
  "displayName": "Auto-Paired Device (Control UI)"
}
```

---

## 附录：测试命令

### 清理容器
```bash
OPENCLAW_CONFIG_DIR=/data/openclaw/openclaw_instances/gw1 \
  ./cleanup-instance.sh gw1
```

### 更新代码
```bash
cd /data/workspace/openclaw
git pull
```

### 重新部署
```bash
OPENCLAW_INSTANCE_ID=gw1 \
OPENCLAW_CONFIG_DIR=/data/openclaw/openclaw_instances/gw1 \
OPENCLAW_INSTANCE_BASE_DIR=/data/openclaw/openclaw_instances/ \
OPENCLAW_PORT_OFFSET=100 \
OPENCLAW_NO_ONBOARD=true \
  ./docker-instance-setup.sh
```

### 测试一键配对 API
```bash
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<INVITE_CODE>"
```

### 查看配对设备
```bash
docker exec openclaw-gw1-openclaw-gateway-1 cat /home/node/.openclaw/devices/paired.json
```

### 查看容器日志
```bash
docker logs openclaw-gw1-openclaw-gateway-1 --tail 50
```
