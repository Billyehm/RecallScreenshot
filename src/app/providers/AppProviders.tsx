import { QueryClientProvider } from "@tanstack/react-query";
import React, { type PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { queryClient } from "../../core/query/queryClient";
import { ThemeProvider } from "../../shared/theme/ThemeContext";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
