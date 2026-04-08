<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';
import Sidebar from './components/Sidebar.vue';

const route = useRoute();
const authStore = useAuthStore();

const showSidebar = computed(() => {
  return authStore.isAuthenticated && route.name !== 'login';
});

// 如果有 token 但 auth 还未检查完成，显示加载状态
const showLoading = computed(() => {
  return !!authStore.token && !authStore.authChecked;
});
</script>

<template>
  <div class="min-h-screen bg-bg-dark">
    <!-- Auth 加载状态 -->
    <div v-if="showLoading" class="min-h-screen flex items-center justify-center">
      <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>

    <template v-else>
      <Sidebar v-if="showSidebar" />
      <main :class="['min-h-screen', showSidebar ? 'ml-64' : '']">
        <router-view />
      </main>
    </template>
  </div>
</template>
