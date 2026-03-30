<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();

const instanceId = computed(() => route.params.id as string);
const models = ref<any[]>([]);
const loading = ref(true);
const showAddForm = ref(false);

const newModel = ref({
  type: 'claude',
  modelIdentifier: '',
  apiKey: '',
  parameters: {
    temperature: 0.7,
    maxTokens: 4096,
  },
});

const modelTypes = [
  { value: 'claude', label: 'Claude' },
  { value: 'gpt', label: 'GPT' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'other', label: '其他' },
];

onMounted(async () => {
  await fetchModels();
});

async function fetchModels(): Promise<void> {
  loading.value = true;
  try {
    const response = await api.get(`/instances/${instanceId.value}/models`);
    if (response.ok && response.data) {
      models.value = (response.data as any).items || [];
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function handleAddModel(): Promise<void> {
  try {
    const response = await api.post(`/instances/${instanceId.value}/models`, {
      type: newModel.value.type,
      modelIdentifier: newModel.value.modelIdentifier,
      apiKey: newModel.value.apiKey || undefined,
      parameters: newModel.value.parameters,
    });

    if (response.ok) {
      await fetchModels();
      showAddForm.value = false;
      newModel.value = {
        type: 'claude',
        modelIdentifier: '',
        apiKey: '',
        parameters: { temperature: 0.7, maxTokens: 4096 },
      };
    }
  } catch (e) {
    console.error(e);
  }
}

async function handleRemoveModel(modelId: string): Promise<void> {
  if (!confirm('确定要移除这个模型吗？')) return;

  try {
    await api.delete(`/instances/${instanceId.value}/models/${modelId}`);
    await fetchModels();
  } catch (e) {
    console.error(e);
  }
}

function goBack(): void {
  router.push(`/instances/${instanceId.value}`);
}

function getTypeLabel(type: string): string {
  return modelTypes.find((t) => t.value === type)?.label || type;
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center gap-4 mb-6">
      <button @click="goBack" class="text-slate-400 hover:text-text-light">
        ← 返回
      </button>
      <h1 class="text-2xl font-bold">模型管理</h1>
    </div>

    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">已加载的模型</h2>
        <button @click="showAddForm = !showAddForm" class="btn btn-primary text-sm">
          + 添加模型
        </button>
      </div>

      <!-- 添加模型表单 -->
      <div v-if="showAddForm" class="mb-6 p-4 bg-bg-dark rounded-lg">
        <h3 class="font-semibold mb-4">添加新模型</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-2">模型类型</label>
            <select v-model="newModel.type" class="w-full">
              <option v-for="t in modelTypes" :key="t.value" :value="t.value">
                {{ t.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-slate-400 mb-2">模型标识符</label>
            <input
              v-model="newModel.modelIdentifier"
              type="text"
              class="w-full"
              placeholder="如: claude-3-5-sonnet"
            />
          </div>

          <div>
            <label class="block text-sm text-slate-400 mb-2">API Key</label>
            <input
              v-model="newModel.apiKey"
              type="password"
              class="w-full"
              placeholder="可选"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-slate-400 mb-2">Temperature</label>
              <input
                v-model.number="newModel.parameters.temperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-2">Max Tokens</label>
              <input
                v-model.number="newModel.parameters.maxTokens"
                type="number"
                min="1"
                class="w-full"
              />
            </div>
          </div>

          <div class="flex gap-3">
            <button @click="showAddForm = false" class="btn btn-secondary">
              取消
            </button>
            <button @click="handleAddModel" class="btn btn-primary">
              添加
            </button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-8">
        <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
      </div>

      <div v-else-if="models.length === 0" class="text-center py-8 text-slate-500">
        暂无模型
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="model in models"
          :key="model.id"
          class="flex items-center justify-between p-4 bg-bg-dark rounded-lg"
        >
          <div>
            <div class="flex items-center gap-2">
              <span class="text-lg">🤖</span>
              <span class="font-semibold">{{ getTypeLabel(model.type) }}</span>
            </div>
            <p class="text-sm text-slate-400 font-mono mt-1">
              {{ model.modelIdentifier }}
            </p>
            <p v-if="model.parameters" class="text-xs text-slate-500 mt-1">
              temperature: {{ model.parameters.temperature }} | maxTokens: {{ model.parameters.maxTokens }}
            </p>
          </div>
          <button
            @click="handleRemoveModel(model.id)"
            class="btn btn-danger text-sm"
          >
            移除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
