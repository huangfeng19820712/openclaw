import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

const BASE_URL = import.meta.env.PROD ? '/api' : 'http://localhost:12548/api';

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  token?: string;
  user?: T;
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器：添加 token
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // 响应拦截器：统一处理错误
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          // 使用 Vue Router 避免页面刷新
          // 注意：这里使用动态导入避免循环依赖
          import('../router').then(({ router }) => {
            router.push('/login');
          }).catch(() => {
            window.location.href = '/login';
          });
        }
        return Promise.reject(error);
      }
    );
  }

  private async request<T = unknown>(
    method: string,
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.client.request({
        method,
        url,
        data,
        ...config,
      });
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data as ApiResponse<T>;
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : '网络错误',
      };
    }
  }

  async get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this.request<T>('GET', url, undefined, { params });
  }

  async post<T = unknown>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', url, data);
  }

  async put<T = unknown>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', url, data);
  }

  async delete<T = unknown>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', url, data);
  }
}

export const api = new ApiClient();
