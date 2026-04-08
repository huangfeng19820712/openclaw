import express, { Express } from 'express';
import type { Server } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import jwt from 'jsonwebtoken';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { jwtAuth } from './middleware/auth.js';
import { rateLimit } from './middleware/rateLimit.js';
import { createInstancesRouter } from './routes/instances.js';
import { createModelsRouter } from './routes/models.js';
import { createChannelsRouter } from './routes/channels.js';
import { createContainersRouter } from './routes/containers.js';
import { createApiKeysRouter } from './routes/apikeys.js';
import { createSystemRouter } from './routes/system.js';
import { createOperationLogsRouter } from './routes/operationLogs.js';
import type { UserService } from './services/user.js';
import type { InstanceService } from './services/instance.js';
import type { ModelService } from './services/model.js';
import type { ChannelService } from './services/channel.js';
import type { ContainerService } from './services/container.js';
import type { OperationLogService } from './services/operationLog.js';
import type { LoadedConfig } from '../config/loader.js';
import type { JwtPayload } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLIENT_DIST_PATH = join(__dirname, '../client');

export interface AppServices {
  userService: UserService;
  instanceService: InstanceService;
  modelService: ModelService;
  channelService: ChannelService;
  containerService: ContainerService;
  operationLogService: OperationLogService;
}

export function createApp(services: AppServices, config: LoadedConfig): Express {
  const app = express();

  // Body parser
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS
  app.use(corsMiddleware(config.cors.allowedOrigins));

  // 静态文件服务
  app.use(express.static(CLIENT_DIST_PATH));

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({ ok: true, status: 'healthy' });
  });

  // ========== 认证路由 ==========
  const { userService } = services;

  // POST /api/auth/login - 公开（限流：5次/分钟）
  app.post('/api/auth/login', rateLimit(5, 60000), async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ ok: false, error: '用户名和密码不能为空' });
        return;
      }

      const user = await userService.validateCredentials(username, password);

      if (!user) {
        res.status(401).json({ ok: false, error: '用户名或密码错误' });
        return;
      }

      const payload: JwtPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        type: 'access',
      };

      const token = jwt.sign(payload, config.auth.jwtSecret, { expiresIn: config.auth.sessionExpire });

      res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ ok: false, error: '登录失败' });
    }
  });

  // POST /api/auth/init - 公开（限流：5次/分钟）
  app.post('/api/auth/init', rateLimit(5, 60000), async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ ok: false, error: '用户名和密码不能为空' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ ok: false, error: '密码长度至少为 8 个字符' });
        return;
      }

      const hasAdmin = await userService.hasAdmin();
      if (hasAdmin) {
        res.status(403).json({ ok: false, error: '管理员账号已存在，请直接登录' });
        return;
      }

      const user = await userService.createAdmin({ username, password });

      const payload: JwtPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        type: 'access',
      };

      const token = jwt.sign(payload, config.auth.jwtSecret, { expiresIn: config.auth.sessionExpire });

      res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Init admin error:', error);
      res.status(500).json({ ok: false, error: '初始化管理员账号失败' });
    }
  });

  // 需要认证的中间件
  const jwtAuthMiddleware = jwtAuth(config.auth.jwtSecret);

  // POST /api/auth/logout - 需要认证
  app.post('/api/auth/logout', jwtAuthMiddleware, async (req, res) => {
    res.json({ ok: true });
  });

  // GET /api/auth/me - 需要认证
  app.get('/api/auth/me', jwtAuthMiddleware, async (req, res) => {
    try {
      const user = await userService.getUserById(req.user!.userId);
      if (!user) {
        res.status(401).json({ ok: false, error: '用户不存在' });
        return;
      }
      res.json({
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ ok: false, error: '获取用户信息失败' });
    }
  });

  // PUT /api/auth/password - 需要认证
  app.put('/api/auth/password', jwtAuthMiddleware, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ ok: false, error: '当前密码和新密码不能为空' });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({ ok: false, error: '新密码长度至少为 8 个字符' });
        return;
      }

      const user = await userService.validateCredentials(req.user!.username, currentPassword);
      if (!user) {
        res.status(401).json({ ok: false, error: '当前密码错误' });
        return;
      }

      const updated = await userService.updatePassword(user.id, newPassword);
      if (!updated) {
        res.status(500).json({ ok: false, error: '更新密码失败' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ ok: false, error: '修改密码失败' });
    }
  });

  // ========== 其他 API 路由 ==========

  // 模型路由 (每个实例独立的 providers/models) - 必须放在 /api/instances 前面
  const modelsRouter = createModelsRouter(services.modelService);
  app.use('/api/instances/:instanceId/models', jwtAuthMiddleware, modelsRouter);

  // 渠道路由 - 必须放在 /api 前面
  const channelsRouter = createChannelsRouter(services.channelService);
  app.use('/api/instances/:instanceId/channels', jwtAuthMiddleware, channelsRouter);

  // 实例路由
  const instancesRouter = createInstancesRouter(services.instanceService);
  app.use('/api/instances', jwtAuthMiddleware, instancesRouter);

  // 容器操作路由
  const containersRouter = createContainersRouter(services.containerService, services.operationLogService);
  app.use('/api/containers', jwtAuthMiddleware, containersRouter);

  // API Key 路由
  const apiKeysRouter = createApiKeysRouter(services.userService);
  app.use('/api/apikeys', jwtAuthMiddleware, apiKeysRouter);

  // 系统路由
  const systemRouter = createSystemRouter(services.containerService);
  app.use('/api/system', jwtAuthMiddleware, systemRouter);

  // 操作日志路由
  const operationLogsRouter = createOperationLogsRouter(services.operationLogService);
  app.use('/api/operation-logs', jwtAuthMiddleware, operationLogsRouter);

  // SPA 路由 - 所有非 API 请求返回 index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(CLIENT_DIST_PATH, 'index.html'));
    } else {
      res.status(404).json({ ok: false, error: `路由不存在: ${req.method} ${req.path}` });
    }
  });

  // 错误处理
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export async function startServer(
  app: Express,
  config: LoadedConfig
): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(config.server.port, config.server.host, () => {
      console.log(`🚀 Instance Console 已启动: http://${config.server.host}:${config.server.port}`);
      resolve(server);
    });
  });
}
