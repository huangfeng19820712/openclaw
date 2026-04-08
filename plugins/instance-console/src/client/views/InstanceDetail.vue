<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useInstancesStore, type Instance } from '../stores/instances';
import StatusBadge from '../components/StatusBadge.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const route = useRoute();
const router = useRouter();
const instancesStore = useInstancesStore();

const instance = ref<Instance | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const logs = ref<string>('');
const showLogs = ref(false);
const showDeleteDialog = ref(false);
const envVars = ref<Array<{ key: string; value: string }>>([]);

// 邀请码相关
const inviteCodeLoading = ref(false);
const inviteCode = ref<string>('');
const accessUrl = ref<string>('');

const sessionKey = computed(() => route.params.id as string);

onMounted(async () => {
  await loadInstance();
});

async function loadInstance(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    instance.value = await instancesStore.fetchInstance(sessionKey.value);
    if (!instance.value) {
      error.value = '实例不存在';
    } else if (instance.value.env) {
      envVars.value = Object.entries(instance.value.env).map(([key, value]) => ({
        key,
        value,
      }));
    }
  } catch (e) {
    error.value = '加载实例失败';
  } finally {
    loading.value = false;
  }
}

async function handleStart(): Promise<void> {
  if (!instance.value) return;
  try {
    await instancesStore.startContainer(instance.value.sessionKey);
    await loadInstance();
  } catch (e) {
    console.error(e);
  }
}

async function handleStop(): Promise<void> {
  if (!instance.value) return;
  try {
    await instancesStore.stopContainer(instance.value.sessionKey);
    await loadInstance();
  } catch (e) {
    console.error(e);
  }
}

async function handleRestart(): Promise<void> {
  if (!instance.value) return;
  try {
    await instancesStore.restartContainer(instance.value.sessionKey);
    await loadInstance();
  } catch (e) {
    console.error(e);
  }
}

async function handleViewLogs(): Promise<void> {
  if (!instance.value) return;
  try {
    logs.value = await instancesStore.getContainerLogs(instance.value.sessionKey);
    showLogs.value = true;
  } catch (e) {
    console.error(e);
  }
}

async function handleDelete(): Promise<void> {
  if (!instance.value) return;
  try {
    await instancesStore.deleteInstance(instance.value.sessionKey);
    router.push('/');
  } catch (e) {
    console.error(e);
  }
  showDeleteDialog.value = false;
}

function goBack(): void {
  router.push('/');
}

function goToModels(): void {
  router.push(`/instances/${sessionKey.value}/models`);
}

function goToChannels(): void {
  router.push(`/instances/${sessionKey.value}/channels`);
}

async function handleGenerateInvite(): Promise<void> {
  if (!instance.value) return;
  inviteCodeLoading.value = true;
  try {
    const response = await fetch(`/api/instances/${instance.value.sessionKey}/generate-invite`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });
    const data = await response.json();
    if (data.ok) {
      inviteCode.value = data.data.inviteCode;
      accessUrl.value = data.data.accessUrl;
    } else {
      alert(`生成邀请码失败: ${data.error}`);
    }
  } catch (e) {
    alert(`生成邀请码失败: ${e}`);
  } finally {
    inviteCodeLoading.value = false;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN');
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center gap-4 mb-6">
      <button @click="goBack" class="text-slate-400 hover:text-text-light">
        ← 返回
      </button>
      <h1 class="text-2xl font-bold">实例详情</h1>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>

    <div v-else-if="error" class="text-center py-12">
      <p class="text-error mb-4">{{ error }}</p>
      <button @click="goBack" class="btn btn-secondary">返回列表</button>
    </div>

    <div v-else-if="instance" class="space-y-6">
      <!-- 基本信息 -->
      <div class="card">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="text-xl font-semibold mb-2">
              {{ instance.displayName || instance.sessionKey }}
            </h2>
            <StatusBadge :status="instance.status" />
          </div>
          <div class="flex gap-2">
            <button @click="goToModels" class="btn btn-secondary text-sm">🤖 模型</button>
            <button @click="goToChannels" class="btn btn-secondary text-sm">📱 渠道</button>
            <button @click="showDeleteDialog = true" class="btn btn-danger text-sm">删除</button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <span class="text-slate-500 text-sm">Session Key</span>
            <p class="font-mono text-sm">{{ instance.sessionKey }}</p>
          </div>
          <div>
            <span class="text-slate-500 text-sm">容器名称</span>
            <p class="font-mono text-sm">{{ instance.containerName }}</p>
          </div>
          <div>
            <span class="text-slate-500 text-sm">Docker 镜像</span>
            <p class="font-mono text-sm">{{ instance.image }}</p>
          </div>
          <div>
            <span class="text-slate-500 text-sm">网络模式</span>
            <p class="text-sm">{{ instance.networkMode || 'bridge' }}</p>
          </div>
          <div>
            <span class="text-slate-500 text-sm">创建时间</span>
            <p class="text-sm">{{ formatDate(instance.createdAt) }}</p>
          </div>
          <div>
            <span class="text-slate-500 text-sm">最后使用</span>
            <p class="text-sm">{{ formatDate(instance.lastUsedAt) }}</p>
          </div>
        </div>
      </div>

      <!-- 端口映射 -->
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">端口映射</h3>
        <div v-if="!instance.ports || Object.keys(instance.ports).length === 0" class="text-slate-500 text-sm">
          暂无端口映射
        </div>
        <div v-else class="space-y-2">
          <div v-for="(hostPort, containerPort) in instance.ports" :key="containerPort" class="flex items-center gap-4 text-sm">
            <span class="text-primary font-mono">{{ containerPort }}</span>
            <span class="text-slate-400">→</span>
            <span class="font-mono text-slate-300">{{ hostPort }}</span>
          </div>
        </div>
      </div>

      <!-- 邀请码访问 -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">邀请码访问</h3>
          <button
            @click="handleGenerateInvite"
            :disabled="inviteCodeLoading"
            class="btn btn-primary text-sm"
          >
            {{ inviteCodeLoading ? '生成中...' : '生成邀请码' }}
          </button>
        </div>

        <div v-if="inviteCode" class="space-y-4">
          <div class="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div class="mb-3">
              <label class="text-sm text-slate-400">邀请码</label>
              <p class="text-2xl font-bold text-green-400 font-mono">{{ inviteCode }}</p>
            </div>
            <div>
              <label class="text-sm text-slate-400">访问地址</label>
              <div class="p-3 bg-bg-dark rounded font-mono text-sm break-all text-slate-300">
                {{ accessUrl }}
              </div>
            </div>
            <p class="text-xs text-slate-500 mt-2">
              复制链接到浏览器打开完成初始配置
            </p>
          </div>
        </div>
        <div v-else class="text-slate-500 text-sm">
          点击"生成邀请码"获取访问链接
        </div>
      </div>

      <!-- 环境变量 -->
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">环境变量</h3>
        <div v-if="envVars.length === 0" class="text-slate-500 text-sm">
          暂无环境变量
        </div>
        <div v-else class="space-y-2">
          <div v-for="env in envVars" :key="env.key" class="flex items-center gap-4 text-sm">
            <span class="text-primary font-mono">{{ env.key }}</span>
            <span class="text-slate-400">=</span>
            <span class="font-mono text-slate-300">{{ env.value }}</span>
          </div>
        </div>
      </div>

      <!-- 容器操作 -->
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">容器操作</h3>
        <div class="flex flex-wrap gap-3">
          <button
            @click="handleStart"
            :disabled="instance.status === 'running'"
            class="btn btn-success"
          >
            ▶ 启动
          </button>
          <button
            @click="handleStop"
            :disabled="instance.status !== 'running'"
            class="btn btn-secondary"
          >
            ⏹ 停止
          </button>
          <button
            @click="handleRestart"
            :disabled="instance.status !== 'running'"
            class="btn btn-secondary"
          >
            🔄 重启
          </button>
          <button @click="handleViewLogs" class="btn btn-secondary">
            📜 日志
          </button>
        </div>
      </div>
    </div>

    <!-- 日志弹窗 -->
    <Teleport to="body">
      <div v-if="showLogs" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showLogs = false">
        <div class="bg-card-dark rounded-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col border border-slate-600">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">容器日志</h3>
            <button @click="showLogs = false" class="text-slate-400 hover:text-text-light">✕</button>
          </div>
          <pre class="flex-1 overflow-auto bg-bg-dark rounded-lg p-4 text-sm font-mono text-slate-300 whitespace-pre-wrap">{{ logs || '暂无日志' }}</pre>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <ConfirmDialog
      :show="showDeleteDialog"
      title="删除实例"
      :message="`确定要删除实例 ${instance?.sessionKey} 吗？此操作不可恢复。`"
      confirmText="删除"
      danger
      :requireInput="instance?.sessionKey"
      @confirm="handleDelete"
      @cancel="showDeleteDialog = false"
    />
  </div>
</template>
