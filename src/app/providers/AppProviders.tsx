import { QueryClientProvider } from "@tanstack/react-query";
import React, { type PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { queryClient } from "../../core/query/queryClient";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}
