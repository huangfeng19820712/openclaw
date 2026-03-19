# 测试报告 #005 - Node Auto-Register 自动化测试套件

## 测试日期
2026-03-19

## 测试类型
纯 API 自动化测试（方案 A）

## 测试环境
| 组件 | 配置 | 说明 |
|------|------|------|
| 测试服务器 | 192.168.90.6 | SSH 访问 |
| OpenClaw | Docker 部署 | 容器名：openclaw-gw1-openclaw-gateway-1 |
| 实例配置 | gw1 | PORT_OFFSET=100 |
| 访问端口 | 18889 | 宿主机端口映射 |

---

## 测试套件结构

```
tests/
├── run-all-tests.sh          # 主入口脚本（支持远程 SSH）
├── run-tests-local.sh        # 本地测试脚本（服务器直接执行）
├── tc001-port-offset.sh      # TC-001: 端口偏移配置测试
├── tc003-one-shot-pair.sh    # TC-003: 一键配对 API 测试
├── tc004-invite-code.sh      # TC-004: 邀请码验证测试
├── tc005-state-files.sh      # TC-005: 配对状态文件测试
└── README.md                 # 使用说明
```

---

## 测试结果

### TC-003: 一键配对 API 测试

| 测试项 | 预期结果 | 实际结果 | 状态 |
|--------|----------|----------|------|
| 有效邀请码 | `{"ok":true,"paired":true,...}` | ✅ 匹配 | PASS |
| 无效邀请码 | `{"ok":false,"error":"invalid or expired..."}` | ✅ 匹配 | PASS |
| 缺失参数 | `{"ok":false,"error":"inviteCode is required"}` | ✅ 匹配 | PASS |
| 配对状态文件 | paired.json 包含设备记录 | ✅ 包含 | PASS |

**测试执行详情：**

```bash
# 测试 1: 有效邀请码
邀请码：TMmA727_e3UhDMiGuHXqiIhpiOkkkoKko2u6m5favho
响应：{"ok":true,"paired":true,"deviceId":"auto-pair-1773935002055-d8d93ae1","deviceToken":"PLXA3tfqTNaRKHIgwahyIebf5bvEHDWOri6mYN0at9c","role":"operator","displayName":"Auto-Paired Device (Control UI)"}

# 测试 2: 无效邀请码
响应：{"ok":false,"error":"invalid or expired invite code"}

# 测试 3: 缺失参数
响应：{"ok":false,"error":"inviteCode is required"}

# 测试 4: paired.json 验证
{
  "auto-pair-1773935002055-d8d93ae1": {
    "deviceId": "auto-pair-1773935002055-d8d93ae1",
    "deviceToken": "PLXA3tfqTNaRKHIgwahyIebf5bvEHDWOri6mYN0at9c",
    "role": "operator",
    ...
  }
}
```

---

### TC-001: 端口偏移配置测试

| 测试项 | 预期端口 | 实际端口 | 状态 |
|--------|----------|----------|------|
| 无偏移 | 18789 | 18789 | ✅ PASS |
| OFFSET=100 | 18889 | 18889 | ✅ PASS |
| OFFSET=200 | 18989 | 18989 | ✅ PASS |
| URL 格式 | 包含 inviteCode 和 session | ✅ 包含 | PASS |

---

## 测试覆盖情况

| 测试用例 | 测试脚本 | 状态 |
|----------|----------|------|
| TC-001: 端口偏移配置 | tc001-port-offset.sh | ✅ 已实现 |
| TC-002: Control UI 自动配对 | 需要 Playwright | ⏳ 待实现 |
| TC-003: 一键配对 API | tc003-one-shot-pair.sh | ✅ 已实现 |
| TC-004: 邀请码验证 | tc004-invite-code.sh | ✅ 已实现 |
| TC-005: 配对状态文件 | tc005-state-files.sh | ✅ 已实现 |
| TC-006: 完整端到端 | 需要 Playwright | ⏳ 待实现 |

**API 测试覆盖率：** 67% (4/6 测试用例)

---

## 使用方法

### 在本地运行（通过 SSH）

```bash
cd docs/personalization/node-auto-register-auto-pair/tests

# 运行所有测试
./run-all-tests.sh

# 运行单个测试
./run-all-tests.sh tc003

# 指定测试服务器
./run-all-tests.sh --host user@server.com --port 18889
```

### 在测试服务器上直接运行

```bash
ssh root@192.168.90.6

# 运行本地测试脚本
bash /data/workspace/openclaw/docs/personalization/node-auto-register-auto-pair/tests/run-tests-local.sh
```

---

## 测试输出示例

```
==============================================
 TC-003: 一键配对 API 测试 (本地模式)
==============================================

[INFO] 步骤 1: 生成测试邀请码...
[INFO] 邀请码：TMmA727_e3UhDMiGuHXqiIhpiOkkkoKko2u6m5favho

[INFO] 步骤 2: 测试有效邀请码...
响应：{"ok":true,"paired":true,...}
✅ PASS: 有效邀请码测试通过

[INFO] 步骤 3: 测试无效邀请码...
响应：{"ok":false,"error":"invalid or expired invite code"}
✅ PASS: 无效邀请码测试通过

[INFO] 步骤 4: 测试缺失参数...
响应：{"ok":false,"error":"inviteCode is required"}
✅ PASS: 缺失参数测试通过

==============================================
 测试结果统计
==============================================
[INFO] 通过：4
[ERROR] 失败：0

🎉 所有测试通过！
```

---

## 结论

**测试状态：** ✅ 通过

**测试套件特点：**
1. **纯 API 测试** - 无需安装 Playwright 或其他浏览器自动化工具
2. **SSH 执行** - 可通过 SSH 远程执行或在服务器本地执行
3. **彩色输出** - 清晰的测试结果展示
4. **易于扩展** - 模块化设计，方便添加新测试用例

**下一步：**
- 如需测试浏览器行为（TC-002、TC-006），需要添加 Playwright E2E 测试
- 可将测试集成到 CI/CD 流程中

---

## 附录：测试命令

### 生成邀请码
```bash
docker exec openclaw-gw1-openclaw-gateway-1 \
  node /home/node/.openclaw/workspace/plugins/node-auto-register/scripts/generate-control-ui-invite-code.js test
```

### 测试一键配对 API
```bash
curl -s "http://127.0.0.1:18889/plugins/node-auto-register/api/one-shot-pair?inviteCode=<CODE>"
```

### 查看配对状态
```bash
docker exec openclaw-gw1-openclaw-gateway-1 \
  cat /home/node/.openclaw/devices/paired.json
```
