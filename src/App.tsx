import React, { useCallback, useState } from "react";

import { useAppBootstrap } from "./app/bootstrap/useAppBootstrap";
import { AppNavigator } from "./app/navigation/AppNavigator";
import { AppProviders } from "./app/providers/AppProviders";
import { RecallIntro } from "./app/components/RecallIntro";

export default function App() {
  useAppBootstrap();
  const [introFinished, setIntroFinished] = useState(false);
  const finishIntro = useCallback(() => setIntroFinished(true), []);

  return (
    <AppProviders>
      {introFinished ? <AppNavigator /> : <RecallIntro onFinish={finishIntro} />}
    </AppProviders>
  );
}
