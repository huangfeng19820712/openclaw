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

  const isAuthenticated = computed(() => !!token.value);

  async function login(username: string, password: string): Promise<void> {
    const response = await api.post('/auth/login', { username, password });
    if (response.ok && response.token) {
      token.value = response.token;
      user.value = response.user || null;
      localStorage.setItem('token', response.token);
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
    } else {
      throw new Error(response.error || '初始化失败');
    }
  }

  async function fetchCurrentUser(): Promise<void> {
    if (!token.value) return;

    try {
      const response = await api.get('/auth/me');
      if (response.ok && response.user) {
        user.value = response.user;
      } else {
        logout();
      }
    } catch {
      logout();
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
    localStorage.removeItem('token');
  }

  // 初始化时获取当前用户
  if (token.value) {
    fetchCurrentUser();
  }

  return {
    token,
    user,
    isAuthenticated,
    login,
    init,
    fetchCurrentUser,
    changePassword,
    logout,
  };
});
