import axios, { AxiosError } from "axios";

import type { AuthTokens, LoginResponse } from "@quanta/shared";

const TOKEN_KEY = "quanta.tokens";
const USER_KEY = "quanta.user";

export function getTokens(): AuthTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as AuthTokens) : null;
}

export function setSession(login: LoginResponse | null): void {
  if (!login) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ accessToken: login.accessToken, refreshToken: login.refreshToken }),
  );
  localStorage.setItem(USER_KEY, JSON.stringify(login.user));
}

export function getStoredUser(): LoginResponse["user"] | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const tokens = getTokens();
  if (tokens) config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  return config;
});

let refreshing: Promise<AuthTokens | null> | null = null;

async function refreshTokens(): Promise<AuthTokens | null> {
  const tokens = getTokens();
  if (!tokens) return null;
  try {
    const { data } = await axios.post<AuthTokens>("/api/auth/refresh", {
      refreshToken: tokens.refreshToken,
    });
    localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
    return data;
  } catch {
    setSession(null);
    return null;
  }
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config;
  if (error.response?.status === 401 && original && !(original as { _retried?: boolean })._retried) {
    (original as { _retried?: boolean })._retried = true;
    refreshing = refreshing ?? refreshTokens();
    const tokens = await refreshing;
    refreshing = null;
    if (tokens) {
      original.headers.Authorization = `Bearer ${tokens.accessToken}`;
      return api.request(original);
    }
    window.location.href = "/login";
  }
  return Promise.reject(error);
});

/** Turkish error message from the API's standard envelope. */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return "Beklenmeyen bir hata oluştu.";
}
