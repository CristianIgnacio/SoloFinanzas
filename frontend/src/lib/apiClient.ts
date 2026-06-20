import axios, { type AxiosRequestConfig } from "axios";

type FastApiValidationError = {
  msg?: string;
};

type FastApiErrorResponse = {
  detail?: string | FastApiValidationError[];
};

// In Vite, local development can avoid browser CORS entirely via the dev-server proxy.
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";

export const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Accept: "application/json",
  },
});

axiosClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError<FastApiErrorResponse>(error)) {
      return Promise.reject(error);
    }

    const detail = error.response?.data?.detail;
    const validationMessage = Array.isArray(detail)
      ? detail
          .map((item) => item.msg)
          .filter(Boolean)
          .join(", ")
      : null;
    const message =
      (typeof detail === "string" && detail) ||
      validationMessage ||
      (error.response
        ? `Error de API: ${error.response.status}`
        : "No fue posible conectar con la API.");

    return Promise.reject(new Error(message));
  },
);

export const apiClient = {
  async get<T>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await axiosClient.get<T>(endpoint, config);
    return response.data;
  },

  async post<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await axiosClient.post<T>(endpoint, data, config);
    return response.data;
  },

  async postForm<T>(endpoint: string, data: FormData): Promise<T> {
    const response = await axiosClient.post<T>(endpoint, data);
    return response.data;
  },

  async patch<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await axiosClient.patch<T>(endpoint, data, config);
    return response.data;
  },

  async put<T>(
    endpoint: string,
    data: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await axiosClient.put<T>(endpoint, data, config);
    return response.data;
  },

  async delete(endpoint: string, config?: AxiosRequestConfig): Promise<void> {
    await axiosClient.delete(endpoint, config);
  },
};
