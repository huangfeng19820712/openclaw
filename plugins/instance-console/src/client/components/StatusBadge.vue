<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: 'running' | 'stopped' | 'error' | 'unknown';
}>();

const statusConfig = {
  running: { color: 'bg-success', text: '运行中' },
  stopped: { color: 'bg-slate-500', text: '已停止' },
  error: { color: 'bg-error', text: '异常' },
  unknown: { color: 'bg-slate-600', text: '未知' },
};

const config = computed(() => statusConfig[props.status] || statusConfig.unknown);
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-sm">
    <span :class="['w-2 h-2 rounded-full', config.color]"></span>
    <span>{{ config.text }}</span>
  </span>
</template>
