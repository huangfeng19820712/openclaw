<script setup lang="ts">
import { useAuthStore } from '../stores/auth';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const navItems = [
  { name: '概览', path: '/', icon: '◉' },
  { name: '实例', path: '/instances', icon: '🖥' },
  { name: '日志', path: '/logs', icon: '📋' },
  { name: '系统', path: '/settings', icon: '⚙' },
];

function isActive(path: string): boolean {
  return route.path === path;
}

function handleLogout(): void {
  authStore.logout();
  router.push('/login');
}
</script>

<template>
  <aside class="fixed left-0 top-0 h-screen w-64 bg-card-dark border-r border-slate-700 flex flex-col">
    <div class="p-4 border-b border-slate-700">
      <h1 class="text-lg font-bold text-text-light flex items-center gap-2">
        <span class="text-primary">◀</span>
        Instance Console
      </h1>
    </div>

    <nav class="flex-1 p-4">
      <ul class="space-y-1">
        <li v-for="item in navItems" :key="item.name">
          <router-link
            :to="item.path"
            :class="[
              'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
              isActive(item.path)
                ? 'bg-primary/20 text-primary'
                : 'text-slate-400 hover:text-text-light hover:bg-slate-700/50',
            ]"
          >
            <span>{{ item.icon }}</span>
            <span>{{ item.name }}</span>
          </router-link>
        </li>
      </ul>
    </nav>

    <div class="p-4 border-t border-slate-700">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm text-slate-400">
          <span>{{ authStore.user?.username }}</span>
        </div>
        <button
          @click="handleLogout"
          class="text-sm text-slate-400 hover:text-error transition-colors"
        >
          登出
        </button>
      </div>
    </div>
  </aside>
</template>
