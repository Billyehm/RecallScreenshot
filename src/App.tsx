import React from "react";

import { useAppBootstrap } from "./app/bootstrap/useAppBootstrap";
import { AppNavigator } from "./app/navigation/AppNavigator";
import { AppProviders } from "./app/providers/AppProviders";

export default function App() {
  useAppBootstrap();

  return (
    <AppProviders>
      <AppNavigator />
    </AppProviders>
  );
}
