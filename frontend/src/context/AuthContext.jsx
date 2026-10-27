import { useEffect, useMemo, useState } from "react";

import AuthContext from "./authContextStore";
import * as authService from "../services/authService";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authService.restoreSession()
      .then((session) => {
        if (active) setUser(session?.user || null);
      })
      .catch((error) => {
        console.error("Could not restore the ShelfLife session:", error);
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    signIn: async (payload) => {
      const result = await authService.login(payload);
      setUser(result.user);
      return result;
    },
    signUp: async (payload) => {
      const result = await authService.register(payload);
      setUser(result.user);
      return result;
    },
    signOut: async () => {
      await authService.logout();
      setUser(null);
    },
    updateUser: (updatedUser) => setUser(updatedUser),
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
