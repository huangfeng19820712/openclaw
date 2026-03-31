<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useInstancesStore } from '../stores/instances';
import InstanceCard from '../components/InstanceCard.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const router = useRouter();
const instancesStore = useInstancesStore();

const showDeleteDialog = ref(false);
const instanceToDelete = ref<string | null>(null);

onMounted(() => {
  instancesStore.fetchInstances();
});

async function handleRefresh(): Promise<void> {
  await instancesStore.fetchInstances();
}

async function handleStart(name: string): Promise<void> {
  try {
    await instancesStore.startContainer(name);
  } catch (e) {
    console.error(e);
  }
}

async function handleStop(name: string): Promise<void> {
  try {
    await instancesStore.stopContainer(name);
  } catch (e) {
    console.error(e);
  }
}

async function handleRestart(name: string): Promise<void> {
  try {
    await instancesStore.restartContainer(name);
  } catch (e) {
    console.error(e);
  }
}

function handleDelete(name: string): void {
  instanceToDelete.value = name;
  showDeleteDialog.value = true;
}

async function confirmDelete(): Promise<void> {
  if (instanceToDelete.value) {
    try {
      await instancesStore.deleteInstance(instanceToDelete.value);
    } catch (e) {
      console.error(e);
    }
  }
  showDeleteDialog.value = false;
  instanceToDelete.value = null;
}

function goToCreate(): void {
  router.push('/instances/new');
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">实例概览</h1>
      <div class="flex items-center gap-4">
        <select v-model="instancesStore.statusFilter" class="text-sm">
          <option value="all">全部</option>
          <option value="running">运行中</option>
          <option value="stopped">已停止</option>
          <option value="error">异常</option>
        </select>
        <input
          v-model="instancesStore.searchQuery"
          type="text"
          placeholder="搜索实例..."
          class="text-sm w-48"
        />
        <button @click="handleRefresh" class="btn btn-secondary text-sm" :disabled="instancesStore.loading">
          🔄
        </button>
      </div>
    </div>

    <div v-if="instancesStore.loading" class="flex items-center justify-center py-12">
      <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>

    <div v-else-if="instancesStore.error" class="text-center py-12">
      <p class="text-error mb-4">{{ instancesStore.error }}</p>
      <button @click="handleRefresh" class="btn btn-primary">重试</button>
    </div>

    <div v-else-if="instancesStore.filteredInstances.length === 0" class="text-center py-12">
      <p class="text-slate-400 mb-4">暂无实例</p>
      <button @click="goToCreate" class="btn btn-primary">创建第一个实例</button>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <InstanceCard
        v-for="instance in instancesStore.filteredInstances"
        :key="instance.id"
        :instance="instance"
        @start="handleStart"
        @stop="handleStop"
        @restart="handleRestart"
        @delete="handleDelete"
      />
    </div>

    <div class="mt-6 text-center" v-if="instancesStore.instances.length > 0">
      <button @click="goToCreate" class="btn btn-primary">
        + 创建新实例
      </button>
    </div>

    <ConfirmDialog
      :show="showDeleteDialog"
      title="删除实例"
      :message="`确定要删除实例 ${instanceToDelete} 吗？此操作将删除容器、网络以及 OpenClaw 工作目录（包括所有配置和数据），不可恢复！`"
      confirmText="删除"
      danger
      :requireInput="instanceToDelete || undefined"
      @confirm="confirmDelete"
      @cancel="showDeleteDialog = false"
    />
  </div>
</template>
