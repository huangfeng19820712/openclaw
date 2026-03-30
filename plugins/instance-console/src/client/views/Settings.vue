<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { api } from '../api';

const authStore = useAuthStore();

const apiKeys = ref<any[]>([]);
const loading = ref(true);
const showNewKeyDialog = ref(false);
const newKeyName = ref('');
const newKeyValue = ref('');
const showPasswordForm = ref(false);
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const success = ref('');

onMounted(async () => {
  await fetchApiKeys();
});

async function fetchApiKeys(): Promise<void> {
  loading.value = true;
  try {
    const response = await api.get('/apikeys');
    if (response.ok && response.data) {
      apiKeys.value = (response.data as any).items || [];
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function handleCreateApiKey(): Promise<void> {
  if (!newKeyName.value) {
    error.value = '请输入 Key 名称';
    return;
  }

  try {
    const response = await api.post('/apikeys', { name: newKeyName.value });
    if (response.ok && response.data) {
      const data = response.data as any;
      newKeyValue.value = data.key;
      await fetchApiKeys();
      showNewKeyDialog.value = false;
      newKeyName.value = '';
    }
  } catch (e) {
    console.error(e);
  }
}

async function handleDeleteApiKey(keyId: string): Promise<void> {
  if (!confirm('确定要删除这个 API Key 吗？')) return;

  try {
    await api.delete(`/apikeys/${keyId}`);
    await fetchApiKeys();
  } catch (e) {
    console.error(e);
  }
}

async function handleChangePassword(): Promise<void> {
  error.value = '';
  success.value = '';

  if (!currentPassword.value || !newPassword.value) {
    error.value = '请填写所有字段';
    return;
  }

  if (newPassword.value.length < 8) {
    error.value = '新密码长度至少为 8 个字符';
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次密码不一致';
    return;
  }

  try {
    await authStore.changePassword(currentPassword.value, newPassword.value);
    success.value = '密码修改成功';
    showPasswordForm.value = false;
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '修改失败';
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN');
}

function copyKey(key: string): void {
  navigator.clipboard.writeText(key);
  success.value = '已复制到剪贴板';
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">系统设置</h1>

    <!-- 成功/错误提示 -->
    <div v-if="success" class="mb-4 p-3 bg-success/20 text-success rounded-lg text-sm">
      {{ success }}
    </div>
    <div v-if="error" class="mb-4 p-3 bg-error/20 text-error rounded-lg text-sm">
      {{ error }}
    </div>

    <!-- 用户信息 -->
    <div class="card mb-6">
      <h2 class="text-lg font-semibold mb-4">当前用户</h2>
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-xl">
          👤
        </div>
        <div>
          <p class="font-semibold">{{ authStore.user?.username }}</p>
          <p class="text-sm text-slate-400">{{ authStore.user?.role }}</p>
        </div>
      </div>
    </div>

    <!-- 修改密码 -->
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">修改密码</h2>
        <button
          @click="showPasswordForm = !showPasswordForm"
          class="btn btn-secondary text-sm"
        >
          {{ showPasswordForm ? '取消' : '修改密码' }}
        </button>
      </div>

      <div v-if="showPasswordForm" class="space-y-4">
        <div>
          <label class="block text-sm text-slate-400 mb-2">当前密码</label>
          <input
            v-model="currentPassword"
            type="password"
            class="w-full"
            placeholder="请输入当前密码"
          />
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-2">新密码</label>
          <input
            v-model="newPassword"
            type="password"
            class="w-full"
            placeholder="请输入新密码"
          />
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-2">确认新密码</label>
          <input
            v-model="confirmPassword"
            type="password"
            class="w-full"
            placeholder="请再次输入新密码"
          />
        </div>
        <button @click="handleChangePassword" class="btn btn-primary">
          确认修改
        </button>
      </div>
    </div>

    <!-- API Keys -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">API Keys</h2>
        <button @click="showNewKeyDialog = true" class="btn btn-primary text-sm">
          + 生成新 Key
        </button>
      </div>

      <p class="text-sm text-slate-400 mb-4">
        使用 API Key 可以不需要 JWT Token 即可访问 API。生成的 Key 只显示一次，请妥善保管。
      </p>

      <div v-if="loading" class="flex items-center justify-center py-8">
        <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
      </div>

      <div v-else-if="apiKeys.length === 0" class="text-center py-8 text-slate-500">
        暂无 API Keys
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="key in apiKeys"
          :key="key.id"
          class="p-4 bg-bg-dark rounded-lg"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold">{{ key.name }}</p>
              <p class="text-xs text-slate-500 font-mono mt-1">
                {{ key.keyPrefix }}********************
              </p>
              <p class="text-xs text-slate-500 mt-1">
                创建于: {{ formatDate(key.createdAt) }}
                <span v-if="key.lastUsedAt"> | 最后使用: {{ formatDate(key.lastUsedAt) }}</span>
              </p>
            </div>
            <button
              @click="handleDeleteApiKey(key.id)"
              class="btn btn-danger text-sm"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建 API Key 弹窗 -->
    <Teleport to="body">
      <div
        v-if="showNewKeyDialog"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        @click.self="showNewKeyDialog = false"
      >
        <div class="bg-card-dark rounded-xl p-6 w-full max-w-md border border-slate-600">
          <div v-if="newKeyValue">
            <h3 class="text-lg font-semibold mb-4">API Key 已生成</h3>
            <p class="text-sm text-slate-400 mb-4">
              请妥善保管此 Key，它将不再显示。
            </p>
            <div class="bg-bg-dark p-3 rounded-lg font-mono text-sm break-all mb-4">
              {{ newKeyValue }}
            </div>
            <div class="flex gap-3">
              <button @click="copyKey(newKeyValue)" class="btn btn-primary flex-1">
                复制
              </button>
              <button @click="showNewKeyDialog = false; newKeyValue = ''" class="btn btn-secondary flex-1">
                完成
              </button>
            </div>
          </div>
          <div v-else>
            <h3 class="text-lg font-semibold mb-4">生成新 API Key</h3>
            <div class="mb-4">
              <label class="block text-sm text-slate-400 mb-2">Key 名称</label>
              <input
                v-model="newKeyName"
                type="text"
                class="w-full"
                placeholder="如: Production Key"
              />
            </div>
            <div class="flex gap-3">
              <button @click="showNewKeyDialog = false" class="btn btn-secondary flex-1">
                取消
              </button>
              <button @click="handleCreateApiKey" class="btn btn-primary flex-1">
                生成
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
