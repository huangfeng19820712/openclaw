import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api';

export interface Instance {
  id: string;
  sessionKey: string;
  displayName?: string;
  containerName: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  image: string;
  createdAt: string;
  lastUsedAt: string;
  ports?: Record<string, string>;
  // 邀请码信息（创建后返回）
  inviteCode?: string;
  inviteCodeName?: string;
  accessUrl?: string;
  serverIp?: string;
  gatewayPort?: number;
}

export interface InstanceCreateInput {
  sessionKey: string;
  displayName?: string;
  dockerImage?: string;
  workdir?: string;
  env?: Record<string, string>;
  networkMode?: string;
  idleTimeoutHours?: number;
}

export const useInstancesStore = defineStore('instances', () => {
  const instances = ref<Instance[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const statusFilter = ref<string>('all');
  const searchQuery = ref('');

  const filteredInstances = computed(() => {
    let result = instances.value;

    if (statusFilter.value !== 'all') {
      result = result.filter((inst) => inst.status === statusFilter.value);
    }

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = result.filter(
        (inst) =>
          inst.sessionKey.toLowerCase().includes(query) ||
          inst.displayName?.toLowerCase().includes(query)
      );
    }

    return result;
  });

  async function fetchInstances(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.get('/instances');
      if (response.ok && response.data) {
        instances.value = response.data.items || [];
      } else {
        error.value = response.error || '获取实例列表失败';
      }
    } catch (e) {
      error.value = '网络错误';
    } finally {
      loading.value = false;
    }
  }

  async function fetchInstance(id: string): Promise<Instance | null> {
    try {
      const response = await api.get(`/instances/${id}`);
      if (response.ok && response.data) {
        return response.data as Instance;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function createInstance(input: InstanceCreateInput): Promise<Instance | null> {
    try {
      const response = await api.post('/instances', input);
      if (response.ok && response.data) {
        await fetchInstances();
        return response.data as Instance;
      }
      throw new Error(response.error || '创建实例失败');
    } catch (e) {
      throw e;
    }
  }

  async function updateInstance(
    id: string,
    updates: Partial<InstanceCreateInput>
  ): Promise<Instance | null> {
    try {
      const response = await api.put(`/instances/${id}`, updates);
      if (response.ok && response.data) {
        await fetchInstances();
        return response.data as Instance;
      }
      throw new Error(response.error || '更新实例失败');
    } catch (e) {
      throw e;
    }
  }

  async function deleteInstance(id: string, confirmName?: string): Promise<void> {
    const response = await api.delete(`/instances/${id}`, { confirmName });
    if (!response.ok) {
      throw new Error(response.error || '删除实例失败');
    }
    await fetchInstances();
  }

  async function startContainer(name: string): Promise<void> {
    const response = await api.post(`/containers/${name}/start`);
    if (!response.ok) {
      throw new Error(response.error || '启动容器失败');
    }
    await fetchInstances();
  }

  async function stopContainer(name: string): Promise<void> {
    const response = await api.post(`/containers/${name}/stop`);
    if (!response.ok) {
      throw new Error(response.error || '停止容器失败');
    }
    await fetchInstances();
  }

  async function restartContainer(name: string): Promise<void> {
    const response = await api.post(`/containers/${name}/restart`);
    if (!response.ok) {
      throw new Error(response.error || '重启容器失败');
    }
    await fetchInstances();
  }

  async function getContainerLogs(name: string, tail: number = 100): Promise<string> {
    const response = await api.get(`/containers/${name}/logs?tail=${tail}`);
    if (response.ok && response.data) {
      return (response.data as { logs: string }).logs;
    }
    throw new Error(response.error || '获取日志失败');
  }

  return {
    instances,
    loading,
    error,
    statusFilter,
    searchQuery,
    filteredInstances,
    fetchInstances,
    fetchInstance,
    createInstance,
    updateInstance,
    deleteInstance,
    startContainer,
    stopContainer,
    restartContainer,
    getContainerLogs,
  };
});
