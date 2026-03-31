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
      path: '/settings',
      name: 'settings',
      component: () => import('../views/Settings.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();

  if (to.meta.requiresAuth !== false && !authStore.isAuthenticated) {
    next({ name: 'login' });
  } else if (to.name === 'login' && authStore.isAuthenticated) {
    next({ name: 'dashboard' });
  } else {
    next();
  }
});

export default router;
