# Instance Console - PRD 产品需求文档

## 1. 概述

### 项目名称
**Instance Console** (实例控制台)

### 项目位置
```
plugins/instance-console/
```

### 核心定位
**独立运行的 Web 管理平台**，不依赖 OpenClaw 主进程，通过 HTTP API 操作 OpenClaw 的 sandbox 功能。

### 目标用户
- OpenClaw 运维人员
- 需要通过图形界面管理容器实例的管理员
- 第三方系统集成方

---

## 2. 核心特性

### 2.1 独立部署
- **独立进程**：不注册为 OpenClaw 插件，自主启动
- **独立端口**：默认 `12548`，可在安装时配置
- **独立配置**：配置文件 `config.yaml`，与 OpenClaw 配置隔离

### 2.2 账号认证
- **安装时配置**：首次运行时生成管理员账号
- **登录方式**：用户名 + 密码
- **会话管理**：JWT Token，会话过期自动刷新
- **密码存储**：bcrypt 哈希加密

### 2.3 第三方集成
- **RESTful API**：标准 HTTP API，支持 curl/wget 直接调用
- **API Key 认证**：支持生成 API Key 用于系统间调用
- **Webhook 回调**：操作事件实时推送
- **CORS 支持**：可配置允许跨域访问

---

## 3. 功能需求

### 3.1 登录模块
- 管理员首次登录（初始化）
- 账号密码登录
- 登录状态保持（JWT）
- 登出功能
- 修改密码

### 3.2 实例列表
- 展示所有容器实例
- 显示每个实例的状态：
  - 运行中（绿色）/ 已停止（灰色）/ 异常（红色）
  - 镜像名称
  - 创建时间
  - 最后使用时间
  - Session Key
- 支持刷新列表
- 支持按状态筛选（全部 / 运行中 / 已停止）
- 支持搜索（按 Session Key 或名称）

### 3.3 创建新实例
- **配置项**：
  - Session Key（必填，实例唯一标识）
  - 显示名称（可选）
  - Docker 镜像（可选，默认为 `openclaw/sandbox`）
  - 工作目录（可选）
  - 环境变量（可选，键值对形式）
  - 网络模式（可选，默认 `bridge`）
  - 超时时间（可选，默认 24 小时）
- **操作**：调用 sandbox 创建逻辑启动新容器

### 3.4 实例配置管理
- 查看实例详细信息
- **可配置项**：
  - 显示名称
  - 环境变量（新增/编辑/删除）
  - 工具策略（tool-policy）
  - 超时设置
- **操作**：保存配置后重启容器使配置生效

### 3.5 模型管理
- 查看实例已加载的模型列表
- **添加模型**：
  - 选择模型类型（Claude / GPT / Gemini 等）
  - 输入模型标识符（如 `claude-3-5-sonnet`）
  - 配置 API Key（加密存储）
  - 设置模型参数（temperature, max_tokens 等）
- **移除模型**

### 3.6 渠道管理
- 查看实例已绑定的渠道列表
- **添加渠道**：
  - 选择渠道类型（飞书 / 钉钉 / Slack / Discord / Telegram 等）
  - 配置渠道凭证（appId, appSecret, webhook 等）
  - 设置渠道路由规则
- **移除渠道**
- **测试渠道连接**：发送测试消息验证配置

### 3.7 容器操作
- 启动容器
- 停止容器
- 重启容器
- 删除容器（确认对话框 + 输入名称确认）
- 查看容器日志
- 进入容器（WebTTY）

---

## 4. 技术架构

### 4.1 技术栈
- **后端**：Node.js + Express.js
- **前端**：Vue 3 + Vite + TailwindCSS
- **状态管理**：Pinia
- **路由**：Vue Router
- **HTTP 客户端**：Axios
- **存储**：
  - 用户数据 → `~/.instance-console/users.json`
  - API Key → `~/.instance-console/apikeys.json`
  - 实例配置 → `~/.openclaw/sandbox-registry.json`
  - 模型配置 → `~/.openclaw/models/`
  - 渠道配置 → `~/.openclaw/channels/`

### 4.2 项目结构
```
plugins/instance-console/
├── src/
│   ├── index.ts                    # 服务入口，启动 Express 服务器
│   ├── config/
│   │   └── loader.ts               # 配置文件加载（YAML）
│   ├── server/
│   │   ├── app.ts                  # Express 应用配置
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT 认证中间件
│   │   │   ├── cors.ts             # CORS 中间件
│   │   │   └── error.ts            # 错误处理中间件
│   │   ├── routes/
│   │   │   ├── auth.ts             # 登录相关路由
│   │   │   ├── instances.ts        # 实例管理路由
│   │   │   ├── models.ts           # 模型管理路由
│   │   │   ├── channels.ts         # 渠道管理路由
│   │   │   └── containers.ts       # 容器操作路由
│   │   └── services/
│   │       ├── user.ts             # 用户管理服务
│   │       ├── instance.ts         # 实例管理服务
│   │       ├── model.ts            # 模型管理服务
│   │       ├── channel.ts          # 渠道管理服务
│   │       └── container.ts        # 容器操作服务
│   ├── client/                     # Vue 3 前端
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/
│   │   │   └── index.ts
│   │   ├── stores/
│   │   │   ├── auth.ts
│   │   │   └── instances.ts
│   │   ├── views/
│   │   │   ├── Login.vue           # 登录页
│   │   │   ├── Dashboard.vue       # 仪表盘/实例列表
│   │   │   ├── InstanceDetail.vue  # 实例详情
│   │   │   ├── CreateInstance.vue  # 创建实例
│   │   │   ├── Models.vue          # 模型管理
│   │   │   ├── Channels.vue        # 渠道管理
│   │   │   └── Settings.vue        # 系统设置
│   │   ├── components/
│   │   │   ├── InstanceCard.vue    # 实例卡片
│   │   │   ├── StatusBadge.vue     # 状态徽章
│   │   │   ├── ConfirmDialog.vue  # 确认对话框
│   │   │   └── Sidebar.vue        # 侧边导航
│   │   └── api/
│   │       └── index.ts           # API 请求封装
│   └── shared/
│       ├── types.ts               # 类型定义
│       └── utils.ts                # 工具函数
├── static/                         # 静态资源
├── config.yaml.example            # 配置示例
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

### 4.3 配置文件格式
```yaml
# config.yaml
server:
  port: 18790
  host: "0.0.0.0"

auth:
  jwtSecret: "your-secret-key"      # JWT 密钥（安装时生成）
  sessionExpire: 86400              # 会话过期时间（秒）

cors:
  allowedOrigins:
    - "http://localhost:18790"
    - "https://your-domain.com"

openclaw:
  configDir: "~/.openclaw"         # OpenClaw 配置目录
  registryFile: "~/.openclaw/sandbox-registry.json"

api:
  enableApiKey: true               # 启用 API Key 认证
  rateLimit: 100                   # API 请求限流（次/分钟）

webhook:
  enabled: false
  url: ""
```

### 4.4 安装初始化流程
```bash
# 首次启动，检测到无配置文件时进入初始化
$ instance-console
? 请设置管理员用户名: admin
? 请设置管理员密码: ********
? 确认管理员密码: ********
✅ 配置文件已生成: ~/.instance-console/config.yaml
✅ 管理员账号已创建
🚀 Instance Console 已启动: http://0.0.0.0:18790
```

---

## 5. API 设计

### 5.1 认证接口

| Method | Path | 描述 | 认证 |
|--------|------|------|------|
| POST | `/api/auth/login` | 登录 | 无 |
| POST | `/api/auth/logout` | 登出 | JWT |
| GET | `/api/auth/me` | 获取当前用户 | JWT |
| PUT | `/api/auth/password` | 修改密码 | JWT |

### 5.2 实例管理接口

| Method | Path | 描述 | 认证 |
|--------|------|------|------|
| GET | `/api/instances` | 获取所有实例列表 | JWT/API Key |
| GET | `/api/instances/:id` | 获取实例详情 | JWT/API Key |
| POST | `/api/instances` | 创建新实例 | JWT/API Key |
| PUT | `/api/instances/:id` | 更新实例配置 | JWT/API Key |
| DELETE | `/api/instances/:id` | 删除实例 | JWT/API Key |

### 5.3 模型管理接口

| Method | Path | 描述 | 认证 |
|--------|------|------|------|
| GET | `/api/instances/:id/models` | 获取实例模型列表 | JWT/API Key |
| POST | `/api/instances/:id/models` | 添加模型 | JWT/API Key |
| DELETE | `/api/instances/:id/models/:modelId` | 移除模型 | JWT/API Key |

### 5.4 渠道管理接口

| Method | Path | 描述 | 认证 |
|--------|------|------|------|
| GET | `/api/instances/:id/channels` | 获取实例渠道列表 | JWT/API Key |
| POST | `/api/instances/:id/channels` | 添加渠道 | JWT/API Key |
| DELETE | `/api/instances/:id/channels/:channelId` | 移除渠道 | JWT/API Key |
| POST | `/api/instances/:id/channels/:channelId/test` | 测试渠道连接 | JWT/API Key |

### 5.5 容器操作接口

| Method | Path | 描述 | 认证 |
|--------|------|------|------|
| POST | `/api/containers/:name/start` | 启动容器 | JWT/API Key |
| POST | `/api/containers/:name/stop` | 停止容器 | JWT/API Key |
| POST | `/api/containers/:name/restart` | 重启容器 | JWT/API Key |
| GET | `/api/containers/:name/logs` | 获取容器日志 | JWT/API Key |

### 5.6 API Key 接口

| Method | Path | 描述 | 认证 |
|--------|------|------|------|
| GET | `/api/apikeys` | 获取 API Key 列表 | JWT |
| POST | `/api/apikeys` | 生成新 API Key | JWT |
| DELETE | `/api/apikeys/:id` | 删除 API Key | JWT |

### 5.7 请求/响应示例

**登录请求**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password123"
}
```

**登录响应**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr_001",
    "username": "admin",
    "role": "admin"
  }
}
```

**使用 API Key 请求**
```http
GET /api/instances
X-API-Key: icak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**创建实例请求**
```http
POST /api/instances
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "sessionKey": "my-instance",
  "displayName": "我的测试实例",
  "dockerImage": "openclaw/sandbox",
  "env": {
    "MODEL_TYPE": "claude"
  },
  "idleTimeoutHours": 24
}
```

---

## 6. UI 设计

### 6.1 设计风格
- **风格**：现代简约 + 科技感，深色主题为主
- **色彩**：
  - 主色：`#6366F1` (Indigo)
  - 成功：`#10B981` (Emerald)
  - 警告：`#F59E0B` (Amber)
  - 错误：`#EF4444` (Red)
  - 背景：`#0F172A` (Slate 900)
  - 卡片：`#1E293B` (Slate 800)
  - 文字：`#F8FAFC` (Slate 50)

### 6.2 登录页
```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                    [Logo: Instance Console]                │
│                                                            │
│              ┌─────────────────────────────┐              │
│              │  用户名                        │              │
│              └─────────────────────────────┘              │
│              ┌─────────────────────────────┐              │
│              │  密码              [显示]    │              │
│              └─────────────────────────────┘              │
│                                                            │
│              [        登 录        ]                       │
│                                                            │
│              首次登录？请联系管理员初始化账号                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 6.3 仪表盘/实例列表
```
┌────────────────────────────────────────────────────────────┐
│ ◀ Instance Console              admin ▼  │  ⚙  │
├──────────┬─────────────────────────────────────────────────┤
│          │                                                 │
│ ◉ 概览  │  搜索: [____________________] [全部 ▼] [🔄]    │
│          │                                                 │
│ 🖥 实例  │  ┌─────────────┐ ┌─────────────┐               │
│          │  │ ● 运行中    │ │ ○ 已停止    │               │
│ 🔧 模型  │  │             │ │             │               │
│          │  │ my-test-01  │ │ my-test-02  │               │
│ 📱 渠道  │  │ Session: s1 │ │ Session: s2 │               │
│          │  │ Image: ...  │ │ Image: ...  │               │
│ ⚙ 系统  │  │             │ │             │               │
│          │  │ ▶ ⏹ 🗑     │ │ ▶ ⏹ 🗑     │               │
│          │  └─────────────┘ └─────────────┘               │
│          │                                                 │
│          │  ┌─────────────┐                               │
│          │  │ ● 运行中    │                               │
│          │  │             │                               │
│          │  │ my-test-03  │                               │
│          │  │ Session: s3  │                               │
│          │  │             │                               │
│          │  │ ▶ ⏹ 🗑     │                               │
│          │  └─────────────┘                               │
│          │                                                 │
│          │               [+ 创建新实例]                    │
└──────────┴─────────────────────────────────────────────────┘
```

### 6.4 实例详情页
```
┌────────────────────────────────────────────────────────────┐
│ ← 返回   实例详情: my-test-01              [编辑] [删除]    │
├──────────┬─────────────────────────────────────────────────┤
│          │                                                 │
│          │  基本信息                                        │
│          │  ─────────────────────────────────────          │
│          │  Session Key:  my-test-01                       │
│          │  显示名称:   我的测试实例                         │
│          │  Docker镜像: openclaw/sandbox:latest            │
│          │  状态:      ● 运行中                             │
│          │  创建时间:  2026-03-29 10:00:00                 │
│          │  最后使用:  2026-03-29 14:30:00                 │
│          │                                                 │
│          │  环境变量                                        │
│          │  ─────────────────────────────────────          │
│          │  MODEL_TYPE=claude        [编辑] [删除]          │
│          │  API_ENDPOINT=https://... [编辑] [删除]          │
│          │                              [+ 添加变量]        │
│          │                                                 │
│          │  模型                                            │
│          │  ─────────────────────────────────────          │
│          │  🤖 Claude 3.5 Sonnet           [管理]           │
│          │                                                 │
│          │  渠道                                            │
│          │  ─────────────────────────────────────          │
│          │  📱 飞书 (oc_xxx)               [管理] [测试]    │
│          │                                                 │
│          │  容器操作                                        │
│          │  ─────────────────────────────────────          │
│          │  [▶ 启动] [⏹ 停止] [🔄 重启] [📜 日志]         │
│          │                                                 │
└──────────┴─────────────────────────────────────────────────┘
```

---

## 7. 第三方集成

### 7.1 API Key 认证流程
```javascript
// 1. 在 UI 中生成 API Key
// 2. 使用 API Key 调用接口
curl -X GET "http://localhost:18790/api/instances" \
  -H "X-API-Key: icak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 7.2 Webhook 回调配置
```yaml
# config.yaml
webhook:
  enabled: true
  url: "https://your-system.com/webhook"
  secret: "webhook-secret-key"
  events:
    - instance.created
    - instance.started
    - instance.stopped
    - instance.deleted
```

### 7.3 Webhook 事件格式
```json
{
  "event": "instance.started",
  "timestamp": "2026-03-29T10:00:00Z",
  "data": {
    "instanceId": "inst_001",
    "sessionKey": "my-test-01",
    "status": "running"
  },
  "signature": "sha256=xxxxxxxxxx"
}
```

### 7.4 SDK 示例
```javascript
// Node.js SDK 示例
import { InstanceConsoleClient } from '@instance-console/sdk';

const client = new InstanceConsoleClient({
  baseUrl: 'http://localhost:18790',
  apiKey: 'icak_xxxxxxxxxxxxxxxx'
});

// 列出所有实例
const instances = await client.instances.list();

// 创建实例
const instance = await client.instances.create({
  sessionKey: 'my-new-instance',
  dockerImage: 'openclaw/sandbox'
});

// 启动实例
await client.containers.start('my-new-instance');
```

---

## 8. 安全考虑

### 8.1 认证
- 密码 bcrypt 加密（cost factor 12）
- JWT Token 签名（HS256）
- API Key 支持撤销
- 登录失败限流（5次/15分钟）

### 8.2 凭证存储
- API Key 加密存储
- 敏感信息不写入日志
- 配置文件权限（600）

### 8.3 操作限制
- 删除容器需二次确认（输入实例名称）
- 危险操作记录审计日志
- API 请求限流

---

## 9. 安装部署

### 9.1 前置要求
- Node.js >= 18.0.0
- Docker
- OpenClaw 已安装并运行

### 9.2 安装步骤
```bash
# 1. 进入项目目录
cd plugins/instance-console

# 2. 安装依赖
npm install

# 3. 构建
npm run build

# 4. 启动（首次启动进入初始化向导）
node dist/index.js

# 5. 或使用 pm2 管理
pm2 start dist/index.js --name instance-console
```

### 9.3 Docker 部署
```yaml
# docker-compose.yml
services:
  instance-console:
    image: instance-console:latest
    ports:
      - "18790:18790"
    volumes:
      - ~/.openclaw:/home/app/.openclaw:ro
      - ~/.instance-console:/home/app/.instance-console
    environment:
      - NODE_ENV=production
```

---

## 10. 验收标准

| # | 功能 | 验收条件 |
|---|------|----------|
| 1 | 独立运行 | 服务可通过 `node index.js` 启动，不依赖 OpenClaw 进程 |
| 2 | 端口独立 | 默认监听 18790 端口，可配置 |
| 3 | 账号登录 | 支持用户名密码登录，首次启动可初始化账号 |
| 4 | JWT 会话 | 登录后获得 JWT Token，有效期内可访问受保护接口 |
| 5 | API Key | 可生成、查看、删除 API Key，支持 API Key 访问 |
| 6 | 实例列表 | 可查看所有容器实例及其状态 |
| 7 | 创建实例 | 可创建新容器实例，配置必要参数 |
| 8 | 配置管理 | 可查看/编辑实例的环境变量等配置 |
| 9 | 模型管理 | 可添加/查看/删除实例的模型配置 |
| 10 | 渠道管理 | 可添加/查看/删除实例的渠道配置 |
| 11 | 容器操作 | 可启动/停止/重启/删除容器 |
| 12 | 日志查看 | 可查看容器日志 |
| 13 | 第三方集成 | 可通过 API Key 认证调用所有 API |
| 14 | Webhook | 支持配置 Webhook 回调 |
| 15 | UI 美观 | 界面设计现代、风格统一、操作流畅 |
| 16 | 深色主题 | 默认深色主题，适合运维使用 |
