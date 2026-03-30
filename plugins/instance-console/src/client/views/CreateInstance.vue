<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useInstancesStore } from '../stores/instances';

const router = useRouter();
const instancesStore = useInstancesStore();

const form = ref({
  sessionKey: '',
  displayName: '',
  dockerImage: 'openclaw-sandbox:bookworm-slim',
  workdir: '',
  networkMode: 'bridge',
  idleTimeoutHours: 24,
});

const envVars = ref<Array<{ key: string; value: string }>>([]);
const newEnvKey = ref('');
const newEnvValue = ref('');
const loading = ref(false);
const error = ref('');

function addEnvVar(): void {
  if (newEnvKey.value && newEnvValue.value) {
    envVars.value.push({ key: newEnvKey.value, value: newEnvValue.value });
    newEnvKey.value = '';
    newEnvValue.value = '';
  }
}

function removeEnvVar(index: number): void {
  envVars.value.splice(index, 1);
}

async function handleSubmit(): Promise<void> {
  if (!form.value.sessionKey) {
    error.value = 'Session Key 不能为空';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const env: Record<string, string> = {};
    for (const { key, value } of envVars.value) {
      env[key] = value;
    }

    const instance = await instancesStore.createInstance({
      ...form.value,
      env: Object.keys(env).length > 0 ? env : undefined,
    });

    if (instance) {
      router.push(`/instances/${instance.sessionKey}`);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败';
  } finally {
    loading.value = false;
  }
}

function goBack(): void {
  router.push('/');
}
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto">
    <div class="flex items-center gap-4 mb-6">
      <button @click="goBack" class="text-slate-400 hover:text-text-light">
        ← 返回
      </button>
      <h1 class="text-2xl font-bold">创建新实例</h1>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-6">
      <!-- 基本信息 -->
      <div class="card">
        <h2 class="text-lg font-semibold mb-4">基本信息</h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-2">
              Session Key <span class="text-error">*</span>
            </label>
            <input
              v-model="form.sessionKey"
              type="text"
              class="w-full"
              placeholder="唯一标识实例的名称"
              required
            />
          </div>

          <div>
            <label class="block text-sm text-slate-400 mb-2">显示名称</label>
            <input
              v-model="form.displayName"
              type="text"
              class="w-full"
              placeholder="可选的友好名称"
            />
          </div>

          <div>
            <label class="block text-sm text-slate-400 mb-2">Docker 镜像</label>
            <input
              v-model="form.dockerImage"
              type="text"
              class="w-full"
              placeholder="openclaw-sandbox:bookworm-slim"
            />
          </div>
        </div>
      </div>

      <!-- 环境变量 -->
      <div class="card">
        <h2 class="text-lg font-semibold mb-4">环境变量</h2>

        <div class="space-y-3 mb-4">
          <div
            v-for="(env, index) in envVars"
            :key="index"
            class="flex items-center gap-2"
          >
            <input
              v-model="env.key"
              type="text"
              class="flex-1 font-mono text-sm"
              placeholder="KEY"
            />
            <span class="text-slate-500">=</span>
            <input
              v-model="env.value"
              type="text"
              class="flex-1 font-mono text-sm"
              placeholder="value"
            />
            <button
              type="button"
              @click="removeEnvVar(index)"
              class="text-error hover:text-red-400"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <input
            v-model="newEnvKey"
            type="text"
            class="flex-1 font-mono text-sm"
            placeholder="KEY"
          />
          <span class="text-slate-500">=</span>
          <input
            v-model="newEnvValue"
            type="text"
            class="flex-1 font-mono text-sm"
            placeholder="value"
          />
          <button
            type="button"
            @click="addEnvVar"
            class="btn btn-secondary text-sm"
          >
            添加
          </button>
        </div>
      </div>

      <!-- 高级设置 -->
      <div class="card">
        <h2 class="text-lg font-semibold mb-4">高级设置</h2>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-slate-400 mb-2">工作目录</label>
            <input
              v-model="form.workdir"
              type="text"
              class="w-full"
              placeholder="/workspace"
            />
          </div>

          <div>
            <label class="block text-sm text-slate-400 mb-2">网络模式</label>
            <select v-model="form.networkMode" class="w-full">
              <option value="bridge">bridge</option>
              <option value="host">host</option>
              <option value="none">none</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-slate-400 mb-2">超时时间（小时）</label>
            <input
              v-model.number="form.idleTimeoutHours"
              type="number"
              class="w-full"
              min="1"
              max="168"
            />
          </div>
        </div>
      </div>

      <div v-if="error" class="text-error text-sm">
        {{ error }}
      </div>

      <div class="flex gap-3">
        <button type="button" @click="goBack" class="btn btn-secondary flex-1">
          取消
        </button>
        <button type="submit" :disabled="loading" class="btn btn-primary flex-1">
          {{ loading ? '创建中...' : '创建实例' }}
        </button>
      </div>
    </form>
  </div>
</template>
