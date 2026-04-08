import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api';

export interface User {
  id: string;
  username: string;
  role: string;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const user = ref<User | null>(null);
  const authLoading = ref(false);
  const authChecked = ref(false);

  const isAuthenticated = computed(() => !!token.value && authChecked.value);

  async function login(username: string, password: string): Promise<void> {
    const response = await api.post('/auth/login', { username, password });
    if (response.ok && response.token) {
      token.value = response.token;
      user.value = response.user || null;
      localStorage.setItem('token', response.token);
      authChecked.value = true;
    } else {
      throw new Error(response.error || '登录失败');
    }
  }

  async function init(username: string, password: string): Promise<void> {
    const response = await api.post('/auth/init', { username, password });
    if (response.ok && response.token) {
      token.value = response.token;
      user.value = response.user || null;
      localStorage.setItem('token', response.token);
      authChecked.value = true;
    } else {
      throw new Error(response.error || '初始化失败');
    }
  }

  async function fetchCurrentUser(): Promise<void> {
    // 如果没有 token，直接标记为已检查
    if (!token.value) {
      authChecked.value = true;
      return;
    }

    authLoading.value = true;
    try {
      const response = await api.get('/auth/me');
      if (response.ok && response.user) {
        user.value = response.user as User;
        authChecked.value = true;
      } else {
        logout();
      }
    } catch {
      logout();
    } finally {
      authLoading.value = false;
    }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await api.put('/auth/password', { currentPassword, newPassword });
    if (!response.ok) {
      throw new Error(response.error || '修改密码失败');
    }
  }

  function logout(): void {
    token.value = null;
    user.value = null;
    authChecked.value = true;
    authLoading.value = false;
    localStorage.removeItem('token');
  }

  // 初始化时获取当前用户
  fetchCurrentUser();

  return {
    token,
    user,
    authLoading,
    authChecked,
    isAuthenticated,
    login,
    init,
    fetchCurrentUser,
    changePassword,
    logout,
  };
});
