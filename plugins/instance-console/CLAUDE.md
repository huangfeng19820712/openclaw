# Instance Console

独立运行的 Web 管理平台，用于管理 OpenClaw 容器实例。

## 技术栈

- **后端**: Node.js + Express.js + TypeScript
- **前端**: Vue 3 + Vite + TailwindCSS + Pinia
- **认证**: JWT + bcrypt
- **运行时**: Node.js >= 18.0.0 (无需 Docker 即可测试 API)

## 项目结构

```
plugins/instance-console/
├── src/
│   ├── index.ts                    # 服务入口，初始化向导
│   ├── config/loader.ts            # YAML 配置加载
│   ├── server/
│   │   ├── app.ts                 # Express 应用，路由配置
│   │   ├── middleware/            # 中间件 (auth, cors, error, rateLimit)
│   │   ├── routes/                # API 路由
│   │   └── services/             # 业务逻辑服务
│   ├── client/                    # Vue 3 前端
│   │   ├── views/                 # 页面组件
│   │   ├── stores/                # Pinia 状态管理
│   │   └── api/                   # API 请求封装
│   └── shared/
│       ├── types.ts               # 类型定义
│       └── utils.ts               # 工具函数
├── dist/                          # 构建输出
├── config.yaml.example            # 配置示例
└── package.json
```

## 核心特性

- 多实例管理：每个容器实例有独立的 models 和 channels 配置
- 配置路径：`~/.openclaw/openclaw_instances/{instanceId}/openclaw.json`
- RESTful API：标准 HTTP API，支持 JWT 和 API Key 认证

## 启动与构建

```bash
# 安装依赖
npm install

# 开发模式 (前后端同时启动)
npm run dev

# 生产构建
npm run build

# 启动服务
npm start
```

## 测试方法

### 本地测试（无需 Docker）

本地可以测试除容器操作外的所有 API（创建/停止/删除容器等需要 Docker）。

**注意**: 本地需要先配置 `~/.instance-console/config.yaml` 并创建用户，或从服务器复制配置目录。

```bash
# 启动服务
npm run dev:server

# 初始化管理员账号 (首次)
curl -X POST http://localhost:12548/api/auth/init \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'

# 登录获取 token
curl -X POST http://localhost:12548/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'

# 使用 token 访问受保护接口
TOKEN="your-jwt-token"
curl -H "Authorization: Bearer $TOKEN" http://localhost:12548/api/instances

# 测试模型 API (per-instance)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:12548/api/instances/pro1/models/providers

# 测试渠道 API
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:12548/api/instances/pro1/channels
```

### 远程服务器测试

服务器地址: `192.168.90.6`

```bash
# SSH 登录服务器
ssh root@192.168.90.6

# 进入项目目录
cd /data/openclaw/openclaw/plugins/instance-console

# 查看服务状态
pm2 status instance-console

# 查看日志
pm2 logs instance-console

# 重启服务（代码更新后）
cd /data/openclaw/openclaw && git pull && npm run build && pm2 restart instance-console

# 测试 API
curl http://localhost:12548/health
curl -H "Authorization: Bearer $TOKEN" http://localhost:12548/api/instances
```

### 无法本地测试的功能

以下功能需要 Docker 支持，只能在服务器上测试：
- 创建/启动/停止/删除容器
- 容器日志查看
- WebTTY 进入容器

## 关键路由说明

### Express Router `req.params` 问题

当使用 `app.use('/api/instances/:instanceId/models', router)` 挂载子路由时，
Express Router 会重置 `req.params`。解决方案是使用中间件保存 `instanceId`：

```typescript
app.use('/api/instances/:instanceId/models', (req, _res, next) => {
  req.instanceId = req.params.instanceId;
  next();
}, jwtAuthMiddleware, modelsRouter);
```

在路由处理器中使用 `req.instanceId` 而非 `req.params.instanceId`。

## 常见问题

1. **端口冲突**: 检查 `config.yaml` 中的端口配置
2. **初始化失败**: 删除 `~/.instance-console/config.yaml` 重新初始化
3. **JWT 过期**: 重新登录获取新 token
4. **服务无法启动**: 检查 `pm2 logs instance-console` 查看错误日志
