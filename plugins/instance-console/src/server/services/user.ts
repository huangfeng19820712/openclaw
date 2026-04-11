import bcrypt from 'bcryptjs';
import { readFileIfExists, ensureDir, expandHomePath, generateId } from '../../shared/utils.js';
import type { User, UserCreateInput, ApiKey } from '../../shared/types.js';
import type { LoadedConfig } from '../../config/loader.js';
import { writeFile } from 'fs/promises';

const BCRYPT_ROUNDS = 12;

export class UserService {
  private usersFile: string;
  private apiKeysFile: string;

  constructor(config: LoadedConfig) {
    this.usersFile = expandHomePath(`${config.configDir}/users.json`);
    this.apiKeysFile = expandHomePath(`${config.configDir}/apikeys.json`);
  }

  /**
   * 初始化用户存储文件
   */
  async init(): Promise<void> {
    await ensureDir(expandHomePath('~/.instance-console'));
    const usersContent = await readFileIfExists(this.usersFile);
    if (!usersContent) {
      await writeFile(this.usersFile, JSON.stringify([]), 'utf-8');
    }
    const apiKeysContent = await readFileIfExists(this.apiKeysFile);
    if (!apiKeysContent) {
      await writeFile(this.apiKeysFile, JSON.stringify([]), 'utf-8');
    }
  }

  /**
   * 创建管理员账号
   */
  async createAdmin(input: UserCreateInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user: User = {
      id: generateId(),
      username: input.username,
      passwordHash,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };

    const users = await this.getUsers();
    users.push(user);
    await this.saveUsers(users);

    return this.sanitizeUser(user);
  }

  /**
   * 验证用户密码
   */
  async validateCredentials(username: string, password: string): Promise<User | null> {
    const users = await this.getUsers();
    const user = users.find((u) => u.username === username);

    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    return this.sanitizeUser(user);
  }

  /**
   * 根据 ID 获取用户
   */
  async getUserById(userId: string): Promise<User | null> {
    const users = await this.getUsers();
    const user = users.find((u) => u.id === userId);
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * 获取所有用户
   */
  async getUsers(): Promise<User[]> {
    const content = await readFileIfExists(this.usersFile);
    if (!content) {
      return [];
    }
    try {
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * 更新用户密码
   */
  async updatePassword(userId: string, newPassword: string): Promise<boolean> {
    const users = await this.getUsers();
    const index = users.findIndex((u) => u.id === userId);

    if (index === -1) {
      return false;
    }

    users[index].passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.saveUsers(users);
    return true;
  }

  /**
   * 生成 API Key
   */
  async createApiKey(userId: string, name: string): Promise<{ apiKey: ApiKey; key: string }> {
    const { generateApiKey } = await import('../../shared/utils.js');
    const key = generateApiKey();
    const keyPrefix = key.slice(0, 12);

    // 存储 key 的 hash 而不是明文
    const keyHash = await bcrypt.hash(key, BCRYPT_ROUNDS);

    const apiKey: ApiKey = {
      id: generateId(),
      keyHash,
      keyPrefix,
      name,
      userId,
      createdAt: new Date().toISOString(),
    };

    const apiKeys = await this.getApiKeys();
    apiKeys.push(apiKey);
    await this.saveApiKeys(apiKeys);

    return { apiKey: this.sanitizeApiKey(apiKey), key };
  }

  /**
   * 获取用户的 API Keys
   */
  async getApiKeysByUser(userId: string): Promise<ApiKey[]> {
    const apiKeys = await this.getApiKeys();
    return apiKeys
      .filter((k) => k.userId === userId)
      .map((k) => this.sanitizeApiKey(k));
  }

  /**
   * 获取所有 API Keys
   */
  async getApiKeys(): Promise<ApiKey[]> {
    const content = await readFileIfExists(this.apiKeysFile);
    if (!content) {
      return [];
    }
    try {
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * 删除 API Key
   */
  async deleteApiKey(keyId: string, userId: string): Promise<boolean> {
    const apiKeys = await this.getApiKeys();
    const index = apiKeys.findIndex((k) => k.id === keyId && k.userId === userId);

    if (index === -1) {
      return false;
    }

    apiKeys.splice(index, 1);
    await this.saveApiKeys(apiKeys);
    return true;
  }

  /**
   * 检查是否有管理员账号
   */
  async hasAdmin(): Promise<boolean> {
    const users = await this.getUsers();
    return users.some((u) => u.role === 'admin');
  }

  private async saveUsers(users: User[]): Promise<void> {
    await writeFile(this.usersFile, JSON.stringify(users, null, 2), 'utf-8');
  }

  private async saveApiKeys(apiKeys: ApiKey[]): Promise<void> {
    await writeFile(this.apiKeysFile, JSON.stringify(apiKeys, null, 2), 'utf-8');
  }

  /**
   * 移除密码哈希，保留安全的数据
   */
  private sanitizeUser(user: User): User {
    const { passwordHash, ...safeUser } = user;
    return safeUser as User;
  }

  /**
   * 移除密钥哈希，保留安全的数据
   */
  private sanitizeApiKey(apiKey: ApiKey): ApiKey {
    const { keyHash, ...safeKey } = apiKey;
    return safeKey as ApiKey;
  }
}
