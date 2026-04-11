<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSystemStore } from '../stores/system';
import { useInstancesStore } from '../stores/instances';

const router = useRouter();
const systemStore = useSystemStore();
const instancesStore = useInstancesStore();

onMounted(() => {
  systemStore.fetchStats();
  instancesStore.fetchInstances();
});

function goToInstances(): void {
  router.push('/instances');
}

function goToCreate(): void {
  router.push('/instances/new');
}
</script>

<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-6">系统概览</h1>

    <!-- 加载状态 -->
    <div v-if="systemStore.loading" class="flex items-center justify-center py-12">
      <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>

    <div v-else-if="systemStore.error" class="text-center py-8">
      <p class="text-error mb-4">{{ systemStore.error }}</p>
      <button @click="systemStore.fetchStats" class="btn btn-primary">重试</button>
    </div>

    <div v-else-if="systemStore.stats" class="space-y-6">
      <!-- 统计卡片 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card">
          <div class="text-slate-400 text-sm mb-1">实例总数</div>
          <div class="text-3xl font-bold">{{ systemStore.stats.instances.total }}</div>
          <div class="text-xs text-slate-500 mt-1">个实例</div>
        </div>
        <div class="card border-green-500/30">
          <div class="text-green-400 text-sm mb-1">运行中</div>
          <div class="text-3xl font-bold text-green-400">{{ systemStore.stats.instances.running }}</div>
          <div class="text-xs text-slate-500 mt-1">个实例</div>
        </div>
        <div class="card border-slate-500/30">
          <div class="text-slate-400 text-sm mb-1">已停止</div>
          <div class="text-3xl font-bold text-slate-400">{{ systemStore.stats.instances.stopped }}</div>
          <div class="text-xs text-slate-500 mt-1">个实例</div>
        </div>
        <div class="card border-red-500/30">
          <div class="text-red-400 text-sm mb-1">异常</div>
          <div class="text-3xl font-bold text-red-400">{{ systemStore.stats.instances.error }}</div>
          <div class="text-xs text-slate-500 mt-1">个实例</div>
        </div>
      </div>

      <!-- 系统状态 -->
      <div class="card">
        <h2 class="text-lg font-semibold mb-4">系统状态</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Docker 状态 -->
          <div>
            <div class="text-sm text-slate-400 mb-2">Docker</div>
            <div v-if="systemStore.stats.docker" class="space-y-1 text-sm">
              <div class="flex justify-between">
                <span class="text-slate-400">版本</span>
                <span class="font-mono">{{ systemStore.stats.docker.version }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">容器</span>
                <span>{{ systemStore.stats.docker.containers }} 个</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">运行中</span>
                <span class="text-green-400">{{ systemStore.stats.docker.running }} 个</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">已停止</span>
                <span class="text-slate-400">{{ systemStore.stats.docker.stopped }} 个</span>
              </div>
            </div>
            <div v-else class="text-slate-500 text-sm">无法获取 Docker 信息</div>
          </div>

          <!-- 磁盘使用 -->
          <div>
            <div class="text-sm text-slate-400 mb-2">磁盘使用</div>
            <div v-if="systemStore.stats.disk" class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-slate-400">已用 / 总计</span>
                <span>{{ systemStore.formatBytes(systemStore.stats.disk.used) }} / {{ systemStore.formatBytes(systemStore.stats.disk.total) }}</span>
              </div>
              <div class="w-full bg-bg-dark rounded-full h-2">
                <div
                  class="h-2 rounded-full transition-all"
                  :class="systemStore.stats.disk.percent > 90 ? 'bg-red-500' : systemStore.stats.disk.percent > 70 ? 'bg-yellow-500' : 'bg-primary'"
                  :style="{ width: systemStore.stats.disk.percent + '%' }"
                ></div>
              </div>
              <div class="text-xs text-slate-500 text-right">{{ systemStore.stats.disk.percent }}% 已用，剩余 {{ systemStore.formatBytes(systemStore.stats.disk.available) }}</div>
            </div>
            <div v-else class="text-slate-500 text-sm">无法获取磁盘信息</div>
          </div>

          <!-- 内存使用 -->
          <div>
            <div class="text-sm text-slate-400 mb-2">内存使用</div>
            <div v-if="systemStore.stats.memory" class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-slate-400">已用 / 总计</span>
                <span>{{ systemStore.formatBytes(systemStore.stats.memory.used) }} / {{ systemStore.formatBytes(systemStore.stats.memory.total) }}</span>
              </div>
              <div class="w-full bg-bg-dark rounded-full h-2">
                <div
                  class="h-2 rounded-full transition-all"
                  :class="systemStore.stats.memory.percent > 90 ? 'bg-red-500' : systemStore.stats.memory.percent > 70 ? 'bg-yellow-500' : 'bg-green-500'"
                  :style="{ width: systemStore.stats.memory.percent + '%' }"
                ></div>
              </div>
              <div class="text-xs text-slate-500 text-right">{{ systemStore.stats.memory.percent }}% 已用，剩余 {{ systemStore.formatBytes(systemStore.stats.memory.available) }}</div>
            </div>
            <div v-else class="text-slate-500 text-sm">无法获取内存信息</div>
          </div>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="card">
        <h2 class="text-lg font-semibold mb-4">快捷操作</h2>
        <div class="flex flex-wrap gap-3">
          <button @click="goToCreate" class="btn btn-primary">
            + 创建新实例
          </button>
          <button @click="goToInstances" class="btn btn-secondary">
            查看所有实例
          </button>
          <button @click="systemStore.fetchStats" class="btn btn-secondary">
            🔄 刷新状态
          </button>
        </div>
      </div>

      <!-- 实例端口占用 -->
      <div class="card">
        <h2 class="text-lg font-semibold mb-4">端口占用</h2>
        <div v-if="instancesStore.instances.length === 0" class="text-slate-500 text-sm">
          暂无实例
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-slate-400 border-b border-slate-700">
                <th class="pb-2">实例</th>
                <th class="pb-2">Gateway (18789)</th>
                <th class="pb-2">Bridge (18790)</th>
                <th class="pb-2">状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="inst in instancesStore.instances" :key="inst.id" class="border-b border-slate-700/50 hover:bg-slate-800/50">
                <td class="py-2 font-mono text-sm">{{ inst.sessionKey }}</td>
                <td class="py-2 font-mono text-xs">
                  <span v-if="inst.ports && inst.ports['18789/tcp']" class="text-green-400">
                    {{ inst.ports['18789/tcp'] }}
                  </span>
                  <span v-else class="text-slate-500">-</span>
                </td>
                <td class="py-2 font-mono text-xs">
                  <span v-if="inst.ports && inst.ports['18790/tcp']" class="text-green-400">
                    {{ inst.ports['18790/tcp'] }}
                  </span>
                  <span v-else class="text-slate-500">-</span>
                </td>
                <td class="py-2">
                  <span
                    class="inline-block px-2 py-0.5 rounded text-xs"
                    :class="inst.status === 'running' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'"
                  >
                    {{ inst.status === 'running' ? '运行中' : '已停止' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
