<script setup lang="ts">
import type { Instance } from '../stores/instances';
import StatusBadge from './StatusBadge.vue';
import { useRouter } from 'vue-router';

const props = defineProps<{
  instance: Instance;
}>();

const emit = defineEmits<{
  start: [name: string];
  stop: [name: string];
  restart: [name: string];
  delete: [name: string];
}>();

const router = useRouter();

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  return '刚刚';
}

function getDisplayPorts(ports?: Record<string, string>): string {
  if (!ports || Object.keys(ports).length === 0) return '无';
  return Object.entries(ports)
    .map(([containerPort, hostPort]) => `${containerPort} → ${hostPort}`)
    .join(', ');
}

function handleView(): void {
  router.push(`/instances/${props.instance.sessionKey}`);
}
</script>

<template>
  <div class="card hover:border-slate-500 transition-colors">
    <div class="flex items-start justify-between mb-3">
      <div>
        <StatusBadge :status="instance.status" />
      </div>
      <span class="text-xs text-slate-500">{{ instance.image }}</span>
    </div>

    <h3 class="font-semibold text-lg mb-1">
      {{ instance.displayName || instance.sessionKey }}
    </h3>
    <p class="text-sm text-slate-400 mb-1">
      Session: {{ instance.sessionKey }}
    </p>
    <p class="text-xs text-slate-500 mb-3">
      端口: {{ getDisplayPorts(instance.ports) }}
    </p>

    <div class="grid grid-cols-2 gap-2 text-xs text-slate-500 mb-4">
      <div>
        <span class="text-slate-600">创建:</span>
        {{ formatDate(instance.createdAt) }}
      </div>
      <div>
        <span class="text-slate-600">最后使用:</span>
        {{ getRelativeTime(instance.lastUsedAt) }}
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        @click="handleView"
        class="btn btn-secondary flex-1 text-sm py-1.5"
      >
        查看
      </button>
      <button
        v-if="instance.status === 'running'"
        @click="emit('stop', instance.sessionKey)"
        class="btn btn-secondary text-sm py-1.5 px-3"
        title="停止"
      >
        ⏹
      </button>
      <button
        v-else
        @click="emit('start', instance.sessionKey)"
        class="btn btn-secondary text-sm py-1.5 px-3"
        title="启动"
      >
        ▶
      </button>
      <button
        @click="emit('restart', instance.sessionKey)"
        class="btn btn-secondary text-sm py-1.5 px-3"
        title="重启"
        :disabled="instance.status !== 'running'"
      >
        🔄
      </button>
      <button
        @click="emit('delete', instance.sessionKey)"
        class="btn btn-danger text-sm py-1.5 px-3"
        title="删除"
      >
        🗑
      </button>
    </div>
  </div>
</template>
