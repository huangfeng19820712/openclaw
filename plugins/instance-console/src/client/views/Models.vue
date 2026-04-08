<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();

// 状态
const loading = ref(true);
const providers = ref<any[]>([]);
const catalog = ref<any[]>([]);
const showAddProviderForm = ref(false);
const showAddModelForm = ref(false);
const selectedProvider = ref<any>(null);

// 新增 Provider
const newProvider = ref({
  providerId: '',
  name: '',
  baseUrl: '',
  apiKey: '',
  api: '',
});
const testingConfig = ref(false);
const testConfigResult = ref<{ success: boolean; message: string } | null>(null);

// 新增模型
const newModel = ref({
  id: '',
  name: '',
  api: '',
  reasoning: false,
  contextWindow: 128000,
  maxTokens: 4096,
});

// Provider 模板
const providerTemplates = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', api: 'openai-responses' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', api: 'anthropic-messages' },
  { id: 'google', name: 'Google AI', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', api: 'google-generative-ai' },
  { id: 'moonshot', name: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', api: 'openai-completions' },
  { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimaxi.com/anthropic', api: 'anthropic-messages' },
  { id: 'qianfan', name: '百度千帆', baseUrl: 'https://qianfan.baidubce.com/v2', api: 'openai-completions' },
  { id: 'zhipuai', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/cogagent/v2', api: 'openai-completions' },
  { id: 'ollama', name: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', api: 'openai-completions' },
];

onMounted(async () => {
  await Promise.all([fetchProviders(), fetchCatalog()]);
});

async function fetchProviders(): Promise<void> {
  try {
    const response = await api.get('/models/providers');
    if (response.ok && response.data) {
      providers.value = response.data;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function fetchCatalog(): Promise<void> {
  try {
    const response = await api.get('/models/catalog');
    if (response.ok && response.data) {
      catalog.value = response.data;
    }
  } catch (e) {
    console.error(e);
  }
}

function selectTemplate(template: any): void {
  newProvider.value.providerId = template.id;
  newProvider.value.name = template.name;
  newProvider.value.baseUrl = template.baseUrl;
  newProvider.value.api = template.api;
}

async function handleAddProvider(): Promise<void> {
  try {
    const response = await api.post('/models/providers', {
      providerId: newProvider.value.providerId,
      baseUrl: newProvider.value.baseUrl,
      apiKey: newProvider.value.apiKey || undefined,
      api: newProvider.value.api,
      models: [],
    });

    if (response.ok) {
      await fetchProviders();
      showAddProviderForm.value = false;
      testConfigResult.value = null;
      newProvider.value = { providerId: '', name: '', baseUrl: '', apiKey: '', api: '' };
    }
  } catch (e) {
    console.error(e);
  }
}

async function handleTestConfig(): Promise<void> {
  if (!newProvider.value.providerId || !newProvider.value.baseUrl || !newProvider.value.apiKey || !newProvider.value.api) {
    testConfigResult.value = { success: false, message: '请填写完整的配置信息' };
    return;
  }

  testingConfig.value = true;
  testConfigResult.value = null;
  try {
    const response = await api.post('/models/providers/test-config', {
      providerId: newProvider.value.providerId,
      baseUrl: newProvider.value.baseUrl,
      apiKey: newProvider.value.apiKey,
      api: newProvider.value.api,
    });

    testConfigResult.value = response as { success: boolean; message: string };
  } catch (e) {
    testConfigResult.value = { success: false, message: `测试失败: ${e}` };
  } finally {
    testingConfig.value = false;
  }
}

async function handleDeleteProvider(providerId: string): Promise<void> {
  if (!confirm('确定要删除这个 Provider 吗？')) return;

  try {
    await api.delete(`/models/providers/${providerId}`);
    await fetchProviders();
  } catch (e) {
    console.error(e);
  }
}

async function handleTestProvider(provider: any): Promise<void> {
  if (!confirm(`确定要测试 ${provider.id} 的连接吗？`)) return;

  try {
    const response = await api.post(`/models/providers/${provider.id}/test`);
    if (response.ok) {
      alert(`✅ ${(response as any).message || '连接成功'}`);
    } else {
      alert(`❌ ${(response as any).message || '连接失败'}`);
    }
  } catch (e) {
    alert(`❌ 测试失败: ${e}`);
  }
}

async function handleAddModel(): Promise<void> {
  if (!selectedProvider.value) return;

  try {
    const response = await api.post(`/models/providers/${selectedProvider.value.id}/models`, newModel.value);

    if (response.ok) {
      // 刷新 provider 详情
      const detailRes = await api.get(`/models/providers/${selectedProvider.value.id}`);
      if (detailRes.ok && detailRes.data) {
        selectedProvider.value = detailRes.data;
      }
      showAddModelForm.value = false;
      newModel.value = { id: '', name: '', api: '', reasoning: false, contextWindow: 128000, maxTokens: 4096 };
    }
  } catch (e) {
    console.error(e);
  }
}

async function handleRemoveModel(modelId: string): Promise<void> {
  if (!selectedProvider.value) return;
  if (!confirm('确定要移除这个模型吗？')) return;

  try {
    await api.delete(`/models/providers/${selectedProvider.value.id}/models/${modelId}`);
    // 刷新 provider 详情
    const detailRes = await api.get(`/models/providers/${selectedProvider.value.id}`);
    if (detailRes.ok && detailRes.data) {
      selectedProvider.value = detailRes.data;
    }
  } catch (e) {
    console.error(e);
  }
}

function selectProvider(provider: any): void {
  // 获取完整详情
  api.get(`/models/providers/${provider.id}`).then(res => {
    if (res.ok && res.data) {
      selectedProvider.value = res.data;
    }
  });
}

function closeProviderDetail(): void {
  selectedProvider.value = null;
}

function goBack(): void {
  router.push('/');
}

function getProviderTemplate(providerId: string): any {
  return providerTemplates.find(t => t.id === providerId);
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center gap-4 mb-6">
      <button @click="goBack" class="text-slate-400 hover:text-text-light">
        ← 返回
      </button>
      <h1 class="text-2xl font-bold">模型配置</h1>
    </div>

    <div class="loading-state" v-if="loading">
      <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>

    <div v-else class="space-y-6">
      <!-- Provider 列表 -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">已配置的 Providers</h2>
          <button @click="showAddProviderForm = !showAddProviderForm" class="btn btn-primary text-sm">
            + 添加 Provider
          </button>
        </div>

        <!-- 添加 Provider 表单 -->
        <div v-if="showAddProviderForm" class="mb-6 p-4 bg-bg-dark rounded-lg">
          <h3 class="font-semibold mb-4">添加新 Provider</h3>

          <!-- 快速模板选择 -->
          <div class="mb-4">
            <label class="block text-sm text-slate-400 mb-2">快速选择模板</label>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                v-for="tpl in providerTemplates"
                :key="tpl.id"
                @click="selectTemplate(tpl)"
                class="p-2 text-sm bg-bg-secondary rounded hover:bg-primary/20 transition"
                :class="{ 'bg-primary/30': newProvider.providerId === tpl.id }"
              >
                {{ tpl.name }}
              </button>
            </div>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-slate-400 mb-2">Provider ID</label>
                <input v-model="newProvider.providerId" type="text" class="w-full" placeholder="如: openai" />
              </div>
              <div>
                <label class="block text-sm text-slate-400 mb-2">名称</label>
                <input v-model="newProvider.name" type="text" class="w-full" placeholder="如: OpenAI" />
              </div>
            </div>

            <div>
              <label class="block text-sm text-slate-400 mb-2">Base URL</label>
              <input v-model="newProvider.baseUrl" type="text" class="w-full" placeholder="https://api.openai.com/v1" />
            </div>

            <div>
              <label class="block text-sm text-slate-400 mb-2">API Key</label>
              <input v-model="newProvider.apiKey" type="password" class="w-full" placeholder="sk-..." />
            </div>

            <div>
              <label class="block text-sm text-slate-400 mb-2">API 类型</label>
              <select v-model="newProvider.api" class="w-full">
                <option value="openai-responses">OpenAI Responses</option>
                <option value="openai-completions">OpenAI Completions</option>
                <option value="anthropic-messages">Anthropic Messages</option>
                <option value="google-generative-ai">Google Generative AI</option>
              </select>
            </div>

            <!-- 测试结果 -->
            <div v-if="testConfigResult" class="p-3 rounded" :class="testConfigResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'">
              {{ testConfigResult.message }}
            </div>

            <div class="flex gap-3">
              <button @click="showAddProviderForm = false" class="btn btn-secondary">取消</button>
              <button @click="handleTestConfig" class="btn btn-secondary" :disabled="testingConfig">
                {{ testingConfig ? '测试中...' : '测试连接' }}
              </button>
              <button @click="handleAddProvider" class="btn btn-primary">添加</button>
            </div>
          </div>
        </div>

        <!-- Provider 列表 -->
        <div v-if="providers.length === 0" class="text-center py-8 text-slate-500">
          暂无配置的 Providers
        </div>

        <div v-else class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="p in providers"
            :key="p.id"
            class="p-4 bg-bg-dark rounded-lg cursor-pointer hover:bg-bg-dark/80 transition"
            @click="selectProvider(p)"
          >
            <div class="flex items-center justify-between">
              <div>
                <span class="font-semibold">{{ p.id }}</span>
                <span class="text-slate-400 text-sm ml-2">{{ getProviderTemplate(p.id)?.name || '' }}</span>
              </div>
              <div class="flex gap-2">
                <button
                  @click.stop="handleTestProvider(p)"
                  class="text-slate-500 hover:text-green-400 p-1"
                  title="测试连接"
                >
                  ✓
                </button>
                <button
                  @click.stop="handleDeleteProvider(p.id)"
                  class="text-slate-500 hover:text-red-400 p-1"
                >
                  ✕
                </button>
              </div>
            </div>
            <div class="text-sm text-slate-400 mt-2">
              <span>{{ p.modelCount }} 个模型</span>
              <span v-if="p.hasApiKey" class="ml-2 text-green-400">✓ 已配置 Key</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Provider 详情 -->
      <div v-if="selectedProvider" class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">{{ selectedProvider.id }} - 模型列表</h2>
          <div class="flex gap-2">
            <button @click="showAddModelForm = !showAddModelForm" class="btn btn-primary text-sm">
              + 添加模型
            </button>
            <button @click="closeProviderDetail" class="btn btn-secondary text-sm">关闭</button>
          </div>
        </div>

        <!-- 添加模型表单 -->
        <div v-if="showAddModelForm" class="mb-6 p-4 bg-bg-dark rounded-lg">
          <h3 class="font-semibold mb-4">添加新模型</h3>

          <!-- 预定义模型选择 -->
          <div class="mb-4" v-if="catalog.find(c => c.id === selectedProvider.id)">
            <label class="block text-sm text-slate-400 mb-2">从目录选择</label>
            <select
              @change="(e: any) => {
                const model = catalog.find(c => c.id === selectedProvider.id)?.models.find((m: any) => m.id === e.target.value);
                if (model) newModel = { ...model };
              }"
              class="w-full"
            >
              <option value="">-- 选择预定义模型 --</option>
              <option
                v-for="m in catalog.find(c => c.id === selectedProvider.id)?.models"
                :key="m.id"
                :value="m.id"
              >
                {{ m.name }} ({{ m.id }})
              </option>
            </select>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-slate-400 mb-2">模型 ID</label>
                <input v-model="newModel.id" type="text" class="w-full" placeholder="如: gpt-4o" />
              </div>
              <div>
                <label class="block text-sm text-slate-400 mb-2">模型名称</label>
                <input v-model="newModel.name" type="text" class="w-full" placeholder="如: GPT-4o" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-slate-400 mb-2">API</label>
                <input v-model="newModel.api" type="text" class="w-full" />
              </div>
              <div class="flex items-center gap-2 pt-6">
                <input v-model="newModel.reasoning" type="checkbox" id="reasoning" />
                <label for="reasoning" class="text-sm">支持推理</label>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-slate-400 mb-2">上下文窗口</label>
                <input v-model.number="newModel.contextWindow" type="number" class="w-full" />
              </div>
              <div>
                <label class="block text-sm text-slate-400 mb-2">最大 Tokens</label>
                <input v-model.number="newModel.maxTokens" type="number" class="w-full" />
              </div>
            </div>

            <div class="flex gap-3">
              <button @click="showAddModelForm = false" class="btn btn-secondary">取消</button>
              <button @click="handleAddModel" class="btn btn-primary">添加</button>
            </div>
          </div>
        </div>

        <!-- 模型列表 -->
        <div v-if="selectedProvider.models?.length === 0" class="text-center py-8 text-slate-500">
          暂无模型
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="model in selectedProvider.models"
            :key="model.id"
            class="flex items-center justify-between p-4 bg-bg-dark rounded-lg"
          >
            <div>
              <div class="flex items-center gap-2">
                <span class="font-semibold">{{ model.name || model.id }}</span>
                <span v-if="model.reasoning" class="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">推理</span>
              </div>
              <p class="text-sm text-slate-400 font-mono mt-1">{{ model.id }}</p>
              <p class="text-xs text-slate-500 mt-1">
                上下文: {{ model.contextWindow?.toLocaleString() }} | 最大: {{ model.maxTokens?.toLocaleString() }}
              </p>
            </div>
            <button @click="handleRemoveModel(model.id)" class="btn btn-danger text-sm">移除</button>
          </div>
        </div>
      </div>

      <!-- 可用模型目录 -->
      <div class="card">
        <h2 class="text-lg font-semibold mb-4">可用模型目录</h2>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="provider in catalog"
            :key="provider.id"
            class="p-4 bg-bg-dark rounded-lg"
          >
            <div class="font-semibold mb-2">{{ provider.name }}</div>
            <div class="text-xs text-slate-400 mb-2">{{ provider.baseUrl }}</div>
            <div class="text-xs text-slate-500">
              {{ provider.models?.length || 0 }} 个预定义模型
            </div>
            <div class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="m in (provider.models || []).slice(0, 3)"
                :key="m.id"
                class="text-xs px-2 py-0.5 bg-bg-secondary rounded"
              >
                {{ m.id }}
              </span>
              <span v-if="(provider.models?.length || 0) > 3" class="text-xs text-slate-500">
                +{{ (provider.models?.length || 0) - 3 }} 更多
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-state {
  @apply flex items-center justify-center py-16;
}
</style>
