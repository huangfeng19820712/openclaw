import { createApp, startServer } from './server/app.js';
import { loadConfig, configExists, createInitialConfig, getConfigDir } from './config/loader.js';
import { UserService } from './server/services/user.js';
import { ContainerService } from './server/services/container.js';
import { InstanceService } from './server/services/instance.js';
import { ModelService } from './server/services/model.js';
import { ChannelService } from './server/services/channel.js';
import { OperationLogService } from './server/services/operationLog.js';
import { generateId, ensureDir } from './shared/utils.js';
import * as readline from 'readline';
import { stdin as input, stdout as output } from 'process';

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function initWizard(): Promise<void> {
  console.log('\n========================================');
  console.log('    Instance Console 初始化向导');
  console.log('========================================\n');

  const configDir = getConfigDir();
  await ensureDir(configDir);

  console.log(`配置目录: ${configDir}\n`);

  let username: string;
  while (true) {
    username = await prompt('请设置管理员用户名: ');
    if (username && username.trim()) {
      break;
    }
    console.log('用户名不能为空');
  }

  let password: string;
  while (true) {
    password = await prompt('请设置管理员密码 (至少8个字符): ');
    if (password.length >= 8) {
      break;
    }
    console.log('密码长度至少为 8 个字符');
  }

  let confirmPassword: string;
  while (true) {
    confirmPassword = await prompt('确认管理员密码: ');
    if (confirmPassword === password) {
      break;
    }
    console.log('两次密码不一致，请重新输入');
  }

  // 生成 JWT secret
  const jwtSecret = generateId() + generateId();

  // 创建配置
  await createInitialConfig(jwtSecret);
  console.log('\n✅ 配置文件已生成');

  // 初始化用户服务
  const config = await loadConfig();
  const userService = new UserService(config);
  await userService.init();

  // 创建管理员账号
  await userService.createAdmin({ username, password });
  console.log('✅ 管理员账号已创建');

  console.log('\n========================================');
  console.log('    初始化完成！');
  console.log('========================================\n');
}

async function main(): Promise<void> {
  try {
    // 检查是否已初始化
    const isInitialized = await configExists();

    if (!isInitialized) {
      await initWizard();
    }

    // 加载配置
    const config = await loadConfig();

    console.log('\n正在启动服务...\n');

    // 初始化服务
    const containerService = new ContainerService();
    const userService = new UserService(config);
    const operationLogService = new OperationLogService(config);
    const instanceService = new InstanceService(config, containerService, operationLogService);
    const modelService = new ModelService(config);
    const channelService = new ChannelService(config);

    // 初始化存储
    await userService.init();
    await modelService.init();
    await channelService.init();

    // 创建并启动应用
    const app = createApp(
      {
        userService,
        containerService,
        instanceService,
        modelService,
        channelService,
        operationLogService,
      },
      config
    );

    await startServer(app, config);

    console.log('\n按 Ctrl+C 停止服务\n');
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

main();
