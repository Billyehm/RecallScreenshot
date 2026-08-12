import { useEffect, useState } from "react";

/**
 * Holds a value back until it stops changing. Search runs against the whole index, so firing on
 * every keystroke would queue a scan per character and show the user results for a prefix they have
 * already finished typing.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return settled;
}
