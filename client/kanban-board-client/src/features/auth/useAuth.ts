"use client";

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "./AuthContext";

/** Consume the auth context. Must be called inside `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
