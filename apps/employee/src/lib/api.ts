import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AuthTokens, AuthUserInfo, LoginResponse } from "@quanta/shared";

const SERVER_URL_KEY = "quanta.serverUrl";
const TOKENS_KEY = "quanta.tokens";
const USER_KEY = "quanta.user";

export async function getServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem(SERVER_URL_KEY);
}

export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(SERVER_URL_KEY, url.replace(/\/+$/, ""));
}

export async function getStoredUser(): Promise<AuthUserInfo | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUserInfo) : null;
}

async function getTokens(): Promise<AuthTokens | null> {
  const raw = await AsyncStorage.getItem(TOKENS_KEY);
  return raw ? (JSON.parse(raw) as AuthTokens) : null;
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKENS_KEY, USER_KEY]);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Network-level failure (offline) as opposed to a server rejection. */
export class NetworkError extends Error {}

async function rawRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const serverUrl = await getServerUrl();
  if (!serverUrl) throw new NetworkError("Sunucu adresi ayarlanmadı.");
  let response: Response;
  try {
    response = await fetch(`${serverUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new NetworkError("Sunucuya ulaşılamıyor.");
  }
  const json = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new ApiError(json.message ?? `Sunucu hatası (${response.status})`, response.status);
  }
  return json;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await rawRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  await AsyncStorage.setItem(
    TOKENS_KEY,
    JSON.stringify({ accessToken: data.accessToken, refreshToken: data.refreshToken }),
  );
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data;
}

/** Authenticated request with a single transparent refresh retry on 401. */
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const tokens = await getTokens();
  if (!tokens) throw new ApiError("Oturum bulunamadı.", 401);
  try {
    return await rawRequest<T>(path, { ...options, token: tokens.accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const fresh = await rawRequest<AuthTokens>("/auth/refresh", {
        method: "POST",
        body: { refreshToken: tokens.refreshToken },
      }).catch(() => null);
      if (!fresh) {
        await clearSession();
        throw error;
      }
      await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(fresh));
      return rawRequest<T>(path, { ...options, token: fresh.accessToken });
    }
    throw error;
  }
}

export async function hasSession(): Promise<boolean> {
  return (await getTokens()) !== null;
}
