import { useEffect } from "react";

import { runDatabaseMigrations } from "../../core/database/migrations";
import { useAppStore } from "../../core/state/useAppStore";

export function useAppBootstrap() {
  const setHasCompletedBootstrap = useAppStore((state) => state.setHasCompletedBootstrap);

  useEffect(() => {
    let isMounted = true;

    runDatabaseMigrations()
      .catch((error) => {
        console.warn("Database migration failed", error);
      })
      .finally(() => {
        if (isMounted) setHasCompletedBootstrap(true);
      });

    return () => {
      isMounted = false;
    };
  }, [setHasCompletedBootstrap]);
}
