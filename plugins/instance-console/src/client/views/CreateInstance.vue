<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useInstancesStore, type Instance } from '../stores/instances';

const router = useRouter();
const instancesStore = useInstancesStore();

const instanceId = ref('');
const dockerImage = ref('openclaw:local');
const loading = ref(false);
const error = ref('');
const createdInstance = ref<Instance | null>(null);

async function handleSubmit(): Promise<void> {
  if (!instanceId.value.trim()) {
    error.value = '实例 ID 不能为空';
    return;
  }

  // 验证实例 ID 格式（只能包含字母、数字、连字符）
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(instanceId.value)) {
    error.value = '实例 ID 只能包含字母、数字和连字符，且不能以连字符开头或结尾';
    return;
  }

  loading.value = true;
  error.value = '';
  createdInstance.value = null;

  try {
    const instance = await instancesStore.createInstance({
      sessionKey: instanceId.value.trim(),
      dockerImage: dockerImage.value,
    });

    if (instance) {
      createdInstance.value = instance;
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

function goToInstance(): void {
  if (createdInstance.value) {
    router.push(`/instances/${createdInstance.value.sessionKey}`);
  }
}
</script>

<template>
  <div class="p-6 max-w-xl mx-auto">
    <div class="flex items-center gap-4 mb-6">
      <button @click="goBack" class="text-slate-400 hover:text-text-light">
        ← 返回
      </button>
      <h1 class="text-2xl font-bold">创建新实例</h1>
    </div>

    <form v-if="!createdInstance" @submit.prevent="handleSubmit" class="space-y-6">
      <div class="card">
        <h2 class="text-lg font-semibold mb-4">实例信息</h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-2">
              实例 ID <span class="text-error">*</span>
            </label>
            <input
              v-model="instanceId"
              type="text"
              class="w-full"
              placeholder="例如: gw1, test, production"
              required
            />
            <p class="text-xs text-slate-500 mt-1">
              只能包含字母、数字和连字符，将用于生成容器名称和端口
            </p>
          </div>

          <div>
            <label class="block text-sm text-slate-400 mb-2">Docker 镜像</label>
            <input
              v-model="dockerImage"
              type="text"
              class="w-full"
              placeholder="openclaw:local"
            />
            <p class="text-xs text-slate-500 mt-1">
              默认使用 openclaw:local，如需自定义镜像请确保镜像已存在
            </p>
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

    <!-- 创建成功显示邀请码信息 -->
    <div v-else class="space-y-6">
      <div class="card bg-green-500/10 border border-green-500/30">
        <h2 class="text-lg font-semibold mb-4 text-green-400">✅ 实例创建成功</h2>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-slate-400 mb-1">实例 ID</label>
              <p class="font-mono">{{ createdInstance.sessionKey }}</p>
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">容器名称</label>
              <p class="font-mono text-sm">{{ createdInstance.containerName }}</p>
            </div>
          </div>

          <div>
            <label class="block text-sm text-slate-400 mb-1">访问地址</label>
            <div class="p-3 bg-bg-dark rounded font-mono text-sm break-all">
              {{ createdInstance.accessUrl }}
            </div>
            <p class="text-xs text-slate-500 mt-1">
              复制链接到浏览器打开完成初始配置
            </p>
          </div>

          <div v-if="createdInstance.inviteCode">
            <label class="block text-sm text-slate-400 mb-1">邀请码</label>
            <p class="font-mono text-lg text-primary">{{ createdInstance.inviteCode }}</p>
          </div>
        </div>
      </div>

      <div class="flex gap-3">
        <button @click="goBack" class="btn btn-secondary flex-1">
          返回列表
        </button>
        <button @click="goToInstance" class="btn btn-primary flex-1">
          查看详情
        </button>
      </div>
    </div>
  </div>
</template>
