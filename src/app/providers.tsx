"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * App-wide TanStack Query client.
 *
 * The admin screens are server-rendered and already arrive with their data, so
 * this is not here to fetch the first paint — it is here to keep a screen that
 * someone left open honest. Two admins take bookings at once; before this, a
 * calendar opened at 09:00 still showed 09:00 at noon, and the second admin
 * booked straight over the first one's slot.
 *
 * `useState` for the client so each browser tab keeps one instance across
 * re-renders, and the server never shares a cache between requests.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Server-rendered data is handed in as initialData; without a
            // non-zero staleTime every query would refetch immediately on
            // mount and throw away a perfectly fresh payload.
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
