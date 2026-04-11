<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();

const instanceId = computed(() => route.params.id as string);
const channels = ref<any[]>([]);
const loading = ref(true);
const showAddForm = ref(false);
const testingChannelId = ref<string | null>(null);
const testResult = ref<{ success: boolean; message: string } | null>(null);

const newChannel = ref({
  type: 'feishu',
  credentials: {
    appId: '',
    appSecret: '',
  },
});

const channelTypes = [
  { value: 'feishu', label: '飞书', fields: ['appId', 'appSecret'] },
  { value: 'dingtalk', label: '钉钉', fields: ['appKey', 'appSecret'] },
  { value: 'slack', label: 'Slack', fields: ['token', 'signingSecret'] },
  { value: 'discord', label: 'Discord', fields: ['botToken'] },
  { value: 'telegram', label: 'Telegram', fields: ['botToken'] },
  { value: 'whatsapp', label: 'WhatsApp', fields: ['phoneNumber', 'authToken'] },
];

const currentChannelFields = computed(() => {
  return channelTypes.find((t) => t.value === newChannel.value.type)?.fields || [];
});

onMounted(async () => {
  await fetchChannels();
});

async function fetchChannels(): Promise<void> {
  loading.value = true;
  try {
    const response = await api.get(`/instances/${instanceId.value}/channels`);
    if (response.ok && response.data) {
      channels.value = (response.data as any).items || [];
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function handleAddChannel(): Promise<void> {
  try {
    const credentials: Record<string, string> = {};
    for (const field of currentChannelFields.value) {
      const input = document.querySelector(`[name="cred_${field}"]`) as HTMLInputElement;
      if (input) {
        credentials[field] = input.value;
      }
    }

    const response = await api.post(`/instances/${instanceId.value}/channels`, {
      type: newChannel.value.type,
      credentials,
    });

    if (response.ok) {
      await fetchChannels();
      showAddForm.value = false;
      newChannel.value = {
        type: 'feishu',
        credentials: { appId: '', appSecret: '' },
      };
    }
  } catch (e) {
    console.error(e);
  }
}

async function handleRemoveChannel(channelId: string): Promise<void> {
  if (!confirm('确定要移除这个渠道吗？')) return;

  try {
    await api.delete(`/instances/${instanceId.value}/channels/${channelId}`);
    await fetchChannels();
  } catch (e) {
    console.error(e);
  }
}

async function handleTestChannel(channelId: string): Promise<void> {
  testingChannelId.value = channelId;
  testResult.value = null;

  try {
    const response = await api.post(`/instances/${instanceId.value}/channels/${channelId}/test`);
    if (response.ok && response.data) {
      testResult.value = response.data as { success: boolean; message: string };
    }
  } catch (e) {
    testResult.value = { success: false, message: '测试失败' };
  } finally {
    testingChannelId.value = null;
  }
}

function goBack(): void {
  router.push(`/instances/${instanceId.value}`);
}

function getTypeLabel(type: string): string {
  return channelTypes.find((t) => t.value === type)?.label || type;
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    feishu: '📱',
    dingtalk: '💬',
    slack: '💬',
    discord: '🎮',
    telegram: '✈️',
    whatsapp: '📞',
  };
  return icons[type] || '📱';
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center gap-4 mb-6">
      <button @click="goBack" class="text-slate-400 hover:text-text-light">
        ← 返回
      </button>
      <h1 class="text-2xl font-bold">渠道管理</h1>
    </div>

    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">已绑定的渠道</h2>
        <button @click="showAddForm = !showAddForm" class="btn btn-primary text-sm">
          + 添加渠道
        </button>
      </div>

      <!-- 添加渠道表单 -->
      <div v-if="showAddForm" class="mb-6 p-4 bg-bg-dark rounded-lg">
        <h3 class="font-semibold mb-4">添加新渠道</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-2">渠道类型</label>
            <select v-model="newChannel.type" class="w-full">
              <option v-for="t in channelTypes" :key="t.value" :value="t.value">
                {{ t.label }}
              </option>
            </select>
          </div>

          <div v-for="field in currentChannelFields" :key="field">
            <label class="block text-sm text-slate-400 mb-2">{{ field }}</label>
            <input
              :name="`cred_${field}`"
              type="password"
              class="w-full"
              :placeholder="field"
            />
          </div>

          <div class="flex gap-3">
            <button @click="showAddForm = false" class="btn btn-secondary">
              取消
            </button>
            <button @click="handleAddChannel" class="btn btn-primary">
              添加
            </button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-8">
        <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
      </div>

      <div v-else-if="channels.length === 0" class="text-center py-8 text-slate-500">
        暂无渠道
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="channel in channels"
          :key="channel.id"
          class="p-4 bg-bg-dark rounded-lg"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-2xl">{{ getTypeIcon(channel.type) }}</span>
              <div>
                <span class="font-semibold">{{ getTypeLabel(channel.type) }}</span>
                <span v-if="channel.credentials?._hasCredentials" class="text-xs text-slate-500 ml-2">
                  (已配置凭证)
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="handleTestChannel(channel.id)"
                :disabled="testingChannelId === channel.id"
                class="btn btn-secondary text-sm"
              >
                {{ testingChannelId === channel.id ? '测试中...' : '测试' }}
              </button>
              <button
                @click="handleRemoveChannel(channel.id)"
                class="btn btn-danger text-sm"
              >
                移除
              </button>
            </div>
          </div>

          <div v-if="testResult && testingChannelId === null" class="mt-3">
            <div
              :class="[
                'text-sm p-2 rounded',
                testResult.success ? 'bg-success/20 text-success' : 'bg-error/20 text-error',
              ]"
            >
              {{ testResult.message }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
