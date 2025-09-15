// src/auth.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';

type AuthCtx = {
  token: string | null;
  setToken: (t: string | null) => void;
  logout: () => void;
};
const Ctx = createContext<AuthCtx>({ token: null, setToken: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('authToken');
    if (t) setTokenState(t);
  }, []);

  const setToken = (t: string | null) => {
    setTokenState(t);
    if (t) localStorage.setItem('authToken', t);
    else localStorage.removeItem('authToken');
  };

  const logout = () => setToken(null);

  return <Ctx.Provider value={{ token, setToken, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
