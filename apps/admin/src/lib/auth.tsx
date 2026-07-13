import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { AuthUserInfo, LoginResponse } from "@quanta/shared";

import { api, getStoredUser, getTokens, setSession } from "./api";

interface AuthContextValue {
  user: AuthUserInfo | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  login: async () => undefined,
  logout: () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserInfo | null>(() =>
    getTokens() ? getStoredUser() : null,
  );

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<LoginResponse>("/auth/login", { email, password });
    if (data.user.role !== "ADMIN" && data.user.role !== "MANAGER") {
      throw new Error("Bu panele yalnızca yönetici hesaplarıyla giriş yapılabilir.");
    }
    setSession(data);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
