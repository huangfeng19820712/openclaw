<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { api } from '../api';

const router = useRouter();
const authStore = useAuthStore();

const isInitializing = ref(false);
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

onMounted(async () => {
  // 检查是否已初始化
  try {
    const response = await api.get('/auth/me');
    if (response.ok && response.user) {
      router.push('/');
    }
  } catch {
    // 未登录
  }
});

async function handleInit(): Promise<void> {
  if (!username.value || !password.value) {
    error.value = '用户名和密码不能为空';
    return;
  }

  if (password.value.length < 8) {
    error.value = '密码长度至少为 8 个字符';
    return;
  }

  if (password.value !== confirmPassword.value) {
    error.value = '两次密码不一致';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    await authStore.init(username.value, password.value);
    router.push('/');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '初始化失败';
  } finally {
    loading.value = false;
  }
}

async function handleLogin(): Promise<void> {
  if (!username.value || !password.value) {
    error.value = '用户名和密码不能为空';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    await authStore.login(username.value, password.value);
    router.push('/');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-bg-dark">
    <div class="w-full max-w-md p-8">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-text-light mb-2">
          <span class="text-primary">◀</span> Instance Console
        </h1>
        <p class="text-slate-400">OpenClaw 实例管理平台</p>
      </div>

      <div class="card">
        <template v-if="isInitializing || !authStore.isAuthenticated">
          <h2 class="text-xl font-semibold mb-6 text-center">
            {{ isInitializing ? '初始化管理员账号' : '登录' }}
          </h2>

          <div class="space-y-4">
            <div>
              <label class="block text-sm text-slate-400 mb-2">用户名</label>
              <input
                v-model="username"
                type="text"
                class="w-full"
                placeholder="请输入用户名"
                @keyup.enter="isInitializing ? handleInit() : handleLogin()"
              />
            </div>

            <div>
              <label class="block text-sm text-slate-400 mb-2">密码</label>
              <input
                v-model="password"
                type="password"
                class="w-full"
                placeholder="请输入密码"
                @keyup.enter="isInitializing ? handleInit() : handleLogin()"
              />
            </div>

            <div v-if="isInitializing">
              <label class="block text-sm text-slate-400 mb-2">确认密码</label>
              <input
                v-model="confirmPassword"
                type="password"
                class="w-full"
                placeholder="请再次输入密码"
                @keyup.enter="handleInit"
              />
            </div>

            <div v-if="error" class="text-error text-sm">
              {{ error }}
            </div>

            <button
              @click="isInitializing ? handleInit() : handleLogin()"
              :disabled="loading"
              class="btn btn-primary w-full"
            >
              {{ loading ? '处理中...' : (isInitializing ? '初始化' : '登录') }}
            </button>

            <p class="text-center text-sm text-slate-500 mt-4">
              {{ isInitializing ? '设置管理员账号开始使用' : '首次登录？请联系管理员初始化账号' }}
            </p>
          </div>
        </template>

        <template v-else>
          <div class="text-center">
            <p class="text-slate-400 mb-4">正在检查登录状态...</p>
            <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
