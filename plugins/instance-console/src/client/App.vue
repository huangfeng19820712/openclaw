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
</script>

<template>
  <div class="min-h-screen bg-bg-dark">
    <Sidebar v-if="showSidebar" />
    <main :class="['min-h-screen', showSidebar ? 'ml-64' : '']">
      <router-view />
    </main>
  </div>
</template>
