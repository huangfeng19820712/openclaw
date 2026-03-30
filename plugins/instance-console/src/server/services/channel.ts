import { readFileIfExists, ensureDir, expandHomePath, generateId } from '../../shared/utils.js';
import type { ChannelConfig, ChannelCreateInput } from '../../shared/types.js';
import type { LoadedConfig } from '../../config/loader.js';
import { writeFile } from 'fs/promises';

export class ChannelService {
  private config: LoadedConfig;
  private channelsDir: string;

  constructor(config: LoadedConfig) {
    this.config = config;
    this.channelsDir = expandHomePath(`${config.openclaw.configDir}/channels`);
  }

  /**
   * 初始化渠道目录
   */
  async init(): Promise<void> {
    await ensureDir(this.channelsDir);
  }

  /**
   * 获取实例的渠道列表
   */
  async getChannelsByInstance(instanceId: string): Promise<ChannelConfig[]> {
    const filePath = this.getChannelFilePath(instanceId);
    const content = await readFileIfExists(filePath);
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
   * 添加渠道
   */
  async addChannel(instanceId: string, input: ChannelCreateInput): Promise<Omit<ChannelConfig, 'credentials'> & { credentials: { _hasCredentials: boolean } }> {
    await this.init();

    const channels = await this.getChannelsByInstance(instanceId);

    const channel: ChannelConfig = {
      id: generateId(),
      instanceId,
      type: input.type,
      credentials: input.credentials,
      routingRules: input.routingRules,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    channels.push(channel);
    await this.saveChannels(instanceId, channels);

    return this.sanitizeChannel(channel);
  }

  /**
   * 移除渠道
   */
  async removeChannel(instanceId: string, channelId: string): Promise<boolean> {
    const channels = await this.getChannelsByInstance(instanceId);
    const index = channels.findIndex((c) => c.id === channelId);

    if (index === -1) {
      return false;
    }

    channels.splice(index, 1);
    await this.saveChannels(instanceId, channels);
    return true;
  }

  /**
   * 获取渠道
   */
  async getChannel(instanceId: string, channelId: string): Promise<ChannelConfig | null> {
    const channels = await this.getChannelsByInstance(instanceId);
    const channel = channels.find((c) => c.id === channelId);
    return channel || null;
  }

  /**
   * 测试渠道连接
   */
  async testChannel(instanceId: string, channelId: string): Promise<{ success: boolean; message: string }> {
    const channel = await this.getChannel(instanceId, channelId);

    if (!channel) {
      return { success: false, message: '渠道不存在' };
    }

    // 根据渠道类型进行不同的测试
    switch (channel.type) {
      case 'feishu':
        return this.testFeishu(channel.credentials);
      case 'dingtalk':
        return this.testDingtalk(channel.credentials);
      case 'telegram':
        return this.testTelegram(channel.credentials);
      case 'slack':
        return this.testSlack(channel.credentials);
      case 'discord':
        return this.testDiscord(channel.credentials);
      default:
        return { success: true, message: '渠道配置已保存' };
    }
  }

  private getChannelFilePath(instanceId: string): string {
    return `${this.channelsDir}/${instanceId}.json`;
  }

  private async saveChannels(instanceId: string, channels: ChannelConfig[]): Promise<void> {
    const filePath = this.getChannelFilePath(instanceId);
    await writeFile(filePath, JSON.stringify(channels, null, 2), 'utf-8');
  }

  private sanitizeChannel(channel: ChannelConfig): Omit<ChannelConfig, 'credentials'> & { credentials: { _hasCredentials: boolean } } {
    const { credentials, ...safeChannel } = channel;
    return {
      ...safeChannel,
      credentials: {
        _hasCredentials: Object.keys(credentials).length > 0,
      },
    };
  }

  private async testFeishu(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
    const { appId, appSecret } = credentials;
    if (!appId || !appSecret) {
      return { success: false, message: '缺少 appId 或 appSecret' };
    }
    // 实际测试：调用飞书 API 获取 tenant_access_token
    try {
      const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      });
      const data = await response.json() as { code?: number; msg?: string };
      if (data.code === 0) {
        return { success: true, message: '连接成功' };
      }
      return { success: false, message: `连接失败: ${data.msg}` };
    } catch (error) {
      return { success: false, message: `连接错误: ${error}` };
    }
  }

  private async testDingtalk(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
    const { appKey, appSecret } = credentials;
    if (!appKey || !appSecret) {
      return { success: false, message: '缺少 appKey 或 appSecret' };
    }
    try {
      const response = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey, appSecret }),
      });
      const data = await response.json() as { accessToken?: string };
      if (data.accessToken) {
        return { success: true, message: '连接成功' };
      }
      return { success: false, message: '连接失败' };
    } catch (error) {
      return { success: false, message: `连接错误: ${error}` };
    }
  }

  private async testTelegram(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
    const { botToken } = credentials;
    if (!botToken) {
      return { success: false, message: '缺少 botToken' };
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const data = await response.json() as { ok?: boolean; result?: { username?: string } };
      if (data.ok) {
        return { success: true, message: `连接成功: @${data.result?.username}` };
      }
      return { success: false, message: '连接失败' };
    } catch (error) {
      return { success: false, message: `连接错误: ${error}` };
    }
  }

  private async testSlack(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
    const { token, signingSecret } = credentials;
    if (!token) {
      return { success: false, message: '缺少 token' };
    }
    try {
      const response = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json() as { ok?: boolean; user?: string };
      if (data.ok) {
        return { success: true, message: `连接成功: ${data.user}` };
      }
      return { success: false, message: '连接失败' };
    } catch (error) {
      return { success: false, message: `连接错误: ${error}` };
    }
  }

  private async testDiscord(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
    const { botToken } = credentials;
    if (!botToken) {
      return { success: false, message: '缺少 botToken' };
    }
    try {
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${botToken}` },
      });
      if (response.ok) {
        const data = await response.json() as { username?: string };
        return { success: true, message: `连接成功: ${data.username}` };
      }
      return { success: false, message: '连接失败' };
    } catch (error) {
      return { success: false, message: `连接错误: ${error}` };
    }
  }
}
