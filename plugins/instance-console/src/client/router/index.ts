import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/Login.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      name: 'overview',
      component: () => import('../views/Overview.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/instances',
      name: 'dashboard',
      component: () => import('../views/Dashboard.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/instances/new',
      name: 'create-instance',
      component: () => import('../views/CreateInstance.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/instances/:id',
      name: 'instance-detail',
      component: () => import('../views/InstanceDetail.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/instances/:id/models',
      name: 'instance-models',
      component: () => import('../views/Models.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/instances/:id/channels',
      name: 'instance-channels',
      component: () => import('../views/Channels.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/logs',
      name: 'operation-logs',
      component: () => import('../views/OperationLogs.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/Settings.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();

  // 如果是登录页，直接放行
  if (to.name === 'login') {
    next();
    return;
  }

  // 如果需要认证且没有 token，跳转到登录页
  if (to.meta.requiresAuth !== false && !authStore.token) {
    next({ name: 'login' });
    return;
  }

  // 如果有 token 但还未验证完成，等待验证
  if (to.meta.requiresAuth !== false && authStore.token && !authStore.authChecked) {
    // 允许带有 token 的请求通过，验证会在后台进行
    // 如果验证失败，API 请求会触发 logout 并重定向到登录页
    next();
    return;
  }

  // 如果已认证，放行
  if (authStore.isAuthenticated) {
    next();
    return;
  }

  // 其他情况跳转到登录页
  next({ name: 'login' });
});

export default router;
