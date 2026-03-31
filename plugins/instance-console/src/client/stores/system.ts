import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api';

export interface SystemStats {
  docker: {
    version: string;
    containers: number;
    running: number;
    stopped: number;
  } | null;
  disk: {
    total: number;
    used: number;
    available: number;
    percent: number;
  } | null;
  memory: {
    total: number;
    used: number;
    available: number;
    percent: number;
  } | null;
  instances: {
    total: number;
    running: number;
    stopped: number;
    error: number;
  };
}

export const useSystemStore = defineStore('system', () => {
  const stats = ref<SystemStats | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchStats(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.get<SystemStats>('/system/stats');
      if (response.ok && response.data) {
        stats.value = response.data;
      } else {
        error.value = response.error || '获取系统统计信息失败';
      }
    } catch (e) {
      error.value = '网络错误';
    } finally {
      loading.value = false;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  return {
    stats,
    loading,
    error,
    fetchStats,
    formatBytes,
  };
});
