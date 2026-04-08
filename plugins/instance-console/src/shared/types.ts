// 用户相关类型
export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface UserCreateInput {
  username: string;
  password: string;
}

// API Key 相关类型
export interface ApiKey {
  id: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  userId: string;
  createdAt: string;
  lastUsedAt?: string;
}

// JWT Token 类型
export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  type: 'access' | 'api';
  iat?: number;
  exp?: number;
}

// 认证响应类型
export interface AuthResponse {
  ok: boolean;
  token?: string;
  user?: {
    id: string;
    username: string;
    role: string;
  };
  error?: string;
}

// 实例相关类型 (与 sandbox-registry 对应)
export interface SandboxRegistryEntry {
  containerName: string;
  sessionKey: string;
  createdAtMs: number;
  lastUsedAtMs: number;
  image: string;
  configHash?: string;
}

export interface Instance {
  id: string;
  sessionKey: string;
  displayName?: string;
  containerName: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  image: string;
  createdAt: string;
  lastUsedAt: string;
  ports?: Record<string, string>;  // 容器端口映射，如 { "18789/tcp": "0.0.0.0:18889" }
  // 邀请码信息（创建后返回）
  inviteCode?: string;
  inviteCodeName?: string;
  accessUrl?: string;
  serverIp?: string;
  gatewayPort?: number;
}

export interface InstanceCreateInput {
  sessionKey: string;
  displayName?: string;
  dockerImage?: string;
  portOffset?: number;
}

export interface InstanceUpdateInput {
  displayName?: string;
  env?: Record<string, string>;
  idleTimeoutHours?: number;
}

// 模型相关类型
export interface ModelConfig {
  id: string;
  instanceId: string;
  type: 'claude' | 'gpt' | 'gemini' | 'other';
  modelIdentifier: string;
  apiKey?: string;
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  createdAt: string;
}

export interface ModelCreateInput {
  type: 'claude' | 'gpt' | 'gemini' | 'other';
  modelIdentifier: string;
  apiKey?: string;
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
}

// 渠道相关类型
export interface ChannelConfig {
  id: string;
  instanceId: string;
  type: 'feishu' | 'dingtalk' | 'slack' | 'discord' | 'telegram' | 'whatsapp' | 'other';
  credentials: Record<string, string>;
  routingRules?: Record<string, string>;
  enabled: boolean;
  createdAt: string;
}

export interface ChannelCreateInput {
  type: 'feishu' | 'dingtalk' | 'slack' | 'discord' | 'telegram' | 'whatsapp' | 'other';
  credentials: Record<string, string>;
  routingRules?: Record<string, string>;
}

// 容器操作相关类型
export interface ContainerLogs {
  name: string;
  logs: string;
  timestamp: string;
}

// 配置文件类型
export interface AppConfig {
  server: {
    port: number;
    host: string;
  };
  auth: {
    jwtSecret: string;
    sessionExpire: number;
  };
  cors: {
    allowedOrigins: string[];
  };
  openclaw: {
    configDir: string;
    registryFile: string;
  };
  api: {
    enableApiKey: boolean;
    rateLimit: number;
  };
  webhook: {
    enabled: boolean;
    url: string;
    secret: string;
    events: string[];
  };
}

// API 响应类型
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// 列表响应类型
export interface ListResponse<T> {
  items: T[];
  total: number;
}
