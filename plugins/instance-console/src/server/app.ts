import express, { Express } from 'express';
import type { Server } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { jwtAuth } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createInstancesRouter } from './routes/instances.js';
import { createModelsRouter } from './routes/models.js';
import { createChannelsRouter } from './routes/channels.js';
import { createContainersRouter } from './routes/containers.js';
import { createApiKeysRouter } from './routes/apikeys.js';
import type { UserService } from './services/user.js';
import type { InstanceService } from './services/instance.js';
import type { ModelService } from './services/model.js';
import type { ChannelService } from './services/channel.js';
import type { ContainerService } from './services/container.js';
import type { LoadedConfig } from '../config/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLIENT_DIST_PATH = join(__dirname, '../client');

export interface AppServices {
  userService: UserService;
  instanceService: InstanceService;
  modelService: ModelService;
  channelService: ChannelService;
  containerService: ContainerService;
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

  // API 路由
  const authRouter = createAuthRouter(
    services.userService,
    config.auth.jwtSecret,
    config.auth.sessionExpire
  );

  // 公开路由
  app.use('/api/auth/login', authRouter);
  app.use('/api/auth/init', authRouter);

  // 需要认证的路由
  const jwtAuthMiddleware = jwtAuth(config.auth.jwtSecret);

  app.use('/api/auth/logout', jwtAuthMiddleware, authRouter);
  app.use('/api/auth/me', jwtAuthMiddleware, authRouter);
  app.use('/api/auth/password', jwtAuthMiddleware, authRouter);

  // 实例路由
  const instancesRouter = createInstancesRouter(services.instanceService);
  app.use('/api/instances', jwtAuthMiddleware, instancesRouter);

  // 模型路由
  const modelsRouter = createModelsRouter(services.modelService);
  app.use('/api', jwtAuthMiddleware, modelsRouter);

  // 渠道路由
  const channelsRouter = createChannelsRouter(services.channelService);
  app.use('/api', jwtAuthMiddleware, channelsRouter);

  // 容器操作路由
  const containersRouter = createContainersRouter(services.containerService);
  app.use('/api/containers', jwtAuthMiddleware, containersRouter);

  // API Key 路由
  const apiKeysRouter = createApiKeysRouter(services.userService);
  app.use('/api/apikeys', jwtAuthMiddleware, apiKeysRouter);

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
