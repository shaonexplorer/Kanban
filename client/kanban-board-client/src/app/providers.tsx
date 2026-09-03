"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/features/auth/AuthContext";

/**
 * Client-side root providers. Mounted by `src/app/layout.tsx` so the
 * rest of the app can use `useQuery` / `useMutation` (TanStack Query)
 * and `useAuth()` without re-mounting.
 *
 * The QueryClient is created via a `useState` initializer so a single
 * instance survives React's hot-reload boundary.
 */
export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
