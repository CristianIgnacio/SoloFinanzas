import axios, { type AxiosRequestConfig } from "axios";
import { supabase } from "./supabase";
import { getApiSession, isCurrentApiSession, type ApiSession } from "./apiSession";

type FastApiValidationError = {
  msg?: string;
};
type CodedApiError = { code: string; message: string; action?: string };

type FastApiErrorResponse = {
  detail?: string | FastApiValidationError[] | CodedApiError;
};

export class ApiRequestError extends Error {
  constructor(message: string, public code: string, public action = "",
    public status?: number, public retryAfter?: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

declare module "axios" {
  interface AxiosRequestConfig {
    sfSessionId?: number;
  }
}

// Capture the session synchronously at invocation, before Axios awaits auth.
function scoped(config?: AxiosRequestConfig): AxiosRequestConfig {
  const session = getApiSession();
  if (!session) throw new axios.CanceledError("La sesión ya no está activa.");
  return { ...config, sfSessionId: session.id };
}

type RequestContext = { session: ApiSession; cleanup: () => void };
const contexts = new WeakMap<object, RequestContext>();

function finish(config?: AxiosRequestConfig) {
  const context = config && contexts.get(config);
  context?.cleanup();
  return context;
}

// In Vite, local development can avoid browser CORS entirely via the dev-server proxy.
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";

export const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000,
  headers: {
    Accept: "application/json",
  },
});

axiosClient.interceptors.request.use(async (config) => {
  const session = getApiSession();
  if (!session || (config.sfSessionId !== undefined && config.sfSessionId !== session.id)) {
    throw new axios.CanceledError("La sesión cambió.");
  }
  let cleanup = () => {};
  if ((config.method ?? "get").toLowerCase() === "get") {
    const controller = new AbortController();
    const signals = [config.signal, session.reads.signal];
    const abort = () => controller.abort();
    for (const signal of signals) {
      if (signal?.aborted) abort();
      else signal?.addEventListener?.("abort", abort, { once: true });
    }
    cleanup = () => { for (const signal of signals) signal?.removeEventListener?.("abort", abort); };
    config.signal = controller.signal;
  }
  contexts.set(config, { session, cleanup });
  try {
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    if (!isCurrentApiSession(session) || data.session?.user.id !== session.userId || config.signal?.aborted) {
      throw new axios.CanceledError("La sesión cambió o la consulta se canceló.");
    }
    if (data.session) config.headers.Authorization = `Bearer ${data.session.access_token}`;
    return config;
  } catch (error) {
    cleanup();
    throw error;
  }
});

axiosClient.interceptors.response.use(
  (response) => {
    const context = finish(response.config);
    if (!context || !isCurrentApiSession(context.session)) throw new axios.CanceledError("La sesión cambió.");
    return response;
  },
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const context = finish(error.config);
      if (context && !isCurrentApiSession(context.session)) return Promise.reject(new axios.CanceledError("La sesión cambió."));
    }
    if (axios.isCancel(error)) return Promise.reject(error);
    if (!axios.isAxiosError<FastApiErrorResponse>(error)) {
      return Promise.reject(error);
    }

    const detail = error.response?.data?.detail;
    const status = error.response?.status;
    const retryAfterValue = error.response?.headers["retry-after"];
    const retryAfter = retryAfterValue == null ? undefined : String(retryAfterValue);
    if (error.response?.status === 401) window.dispatchEvent(new Event("sf:session-expired"));
    if (detail && !Array.isArray(detail) && typeof detail === "object" && "code" in detail) {
      return Promise.reject(new ApiRequestError(detail.message, detail.code, detail.action ?? "", status, retryAfter));
    }
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

    return Promise.reject(new ApiRequestError(message, error.code ?? "HTTP_ERROR", "", status, retryAfter));
  },
);

export const apiClient = {
  async get<T>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await axiosClient.get<T>(endpoint, scoped(config));
    return response.data;
  },

  async post<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await axiosClient.post<T>(endpoint, data, scoped(config));
    return response.data;
  },

  async postForm<T>(endpoint: string, data: FormData): Promise<T> {
    const response = await axiosClient.post<T>(endpoint, data, scoped());
    return response.data;
  },

  async patch<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await axiosClient.patch<T>(endpoint, data, scoped(config));
    return response.data;
  },

  async put<T>(
    endpoint: string,
    data: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await axiosClient.put<T>(endpoint, data, scoped(config));
    return response.data;
  },

  async delete<T = void>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await axiosClient.delete<T>(endpoint, scoped(config));
    return response.data;
  },
};
