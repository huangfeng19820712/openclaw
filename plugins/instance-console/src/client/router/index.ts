import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

// 将 router 实例导出给 api 模块使用
export const router = createRouter({
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

// 等待 auth 检查完成的辅助函数
async function waitForAuthCheck(maxWaitMs: number = 5000): Promise<boolean> {
  const authStore = useAuthStore();
  const startTime = Date.now();

  while (!authStore.authChecked && Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return authStore.authChecked;
}

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  // 如果是登录页，直接放行
  if (to.name === 'login') {
    next();
    return;
  }

  // 如果还没有检查过 auth，等待检查完成（最多等待 5 秒）
  if (!authStore.authChecked) {
    await waitForAuthCheck();

    // 如果等待后 auth 仍然未检查，且没有 token，跳转到登录
    if (!authStore.authChecked && !authStore.token) {
      next({ name: 'login' });
      return;
    }
  }

  // 如果有 token 但 auth 检查完成且失败，跳转到登录
  if (to.meta.requiresAuth !== false && authStore.token && !authStore.isAuthenticated) {
    next({ name: 'login' });
    return;
  }

  // 如果需要认证且没有 token，跳转到登录页
  if (to.meta.requiresAuth !== false && !authStore.token) {
    next({ name: 'login' });
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
