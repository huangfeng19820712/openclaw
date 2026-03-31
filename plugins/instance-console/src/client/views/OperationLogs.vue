<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();

interface OperationLog {
  id: string;
  action: 'start' | 'stop' | 'restart' | 'create' | 'delete' | 'update';
  target: string;
  targetType: 'instance' | 'container';
  result: 'success' | 'failed';
  message?: string;
  timestamp: string;
}

const logs = ref<OperationLog[]>([]);
const total = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = 50;

const actionLabels: Record<string, string> = {
  start: '启动',
  stop: '停止',
  restart: '重启',
  create: '创建',
  delete: '删除',
  update: '更新',
};

const actionColors: Record<string, string> = {
  start: 'text-green-400',
  stop: 'text-slate-400',
  restart: 'text-yellow-400',
  create: 'text-blue-400',
  delete: 'text-red-400',
  update: 'text-purple-400',
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

async function fetchLogs(): Promise<void> {
  loading.value = true;
  try {
    const response = await api.get<{ logs: OperationLog[]; total: number }>('/operation-logs', { limit: pageSize, offset: (page.value - 1) * pageSize });
    if (response.ok && response.data) {
      logs.value = response.data.logs;
      total.value = response.data.total;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function clearLogs(): Promise<void> {
  if (!confirm('确定要清空所有操作日志吗？')) return;
  try {
    await api.delete('/operation-logs');
    logs.value = [];
    total.value = 0;
  } catch (e) {
    console.error(e);
  }
}

function goBack(): void {
  router.push('/');
}

onMounted(() => {
  fetchLogs();
});
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <button @click="goBack" class="text-slate-400 hover:text-text-light">
          ← 返回
        </button>
        <h1 class="text-2xl font-bold">操作日志</h1>
        <span class="text-sm text-slate-500">共 {{ total }} 条记录</span>
      </div>
      <button
        @click="clearLogs"
        class="btn btn-secondary text-sm"
        :disabled="logs.length === 0"
      >
        清空日志
      </button>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>

    <div v-else-if="logs.length === 0" class="text-center py-12">
      <p class="text-slate-500">暂无操作日志</p>
    </div>

    <div v-else class="card">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-slate-400 border-b border-slate-700">
              <th class="pb-3">时间</th>
              <th class="pb-3">操作</th>
              <th class="pb-3">目标</th>
              <th class="pb-3">类型</th>
              <th class="pb-3">结果</th>
              <th class="pb-3">详情</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in logs"
              :key="log.id"
              class="border-b border-slate-700/50 hover:bg-slate-800/30"
            >
              <td class="py-3 font-mono text-xs">{{ formatTime(log.timestamp) }}</td>
              <td class="py-3">
                <span :class="actionColors[log.action] || ''" class="font-medium">
                  {{ actionLabels[log.action] || log.action }}
                </span>
              </td>
              <td class="py-3 font-mono text-xs">{{ log.target }}</td>
              <td class="py-3 text-slate-400">
                {{ log.targetType === 'instance' ? '实例' : '容器' }}
              </td>
              <td class="py-3">
                <span
                  :class="log.result === 'success' ? 'text-green-400' : 'text-red-400'"
                  class="inline-block px-2 py-0.5 rounded text-xs"
                  :style="{ backgroundColor: log.result === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)' }"
                >
                  {{ log.result === 'success' ? '成功' : '失败' }}
                </span>
              </td>
              <td class="py-3 text-slate-500 text-xs max-w-xs truncate">
                {{ log.message || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div v-if="total > pageSize" class="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
        <button
          @click="page--; fetchLogs()"
          :disabled="page === 1"
          class="btn btn-secondary text-sm"
        >
          上一页
        </button>
        <span class="text-sm text-slate-400">
          第 {{ page }} 页，共 {{ Math.ceil(total / pageSize) }} 页
        </span>
        <button
          @click="page++; fetchLogs()"
          :disabled="page * pageSize >= total"
          class="btn btn-secondary text-sm"
        >
          下一页
        </button>
      </div>
    </div>
  </div>
</template>
