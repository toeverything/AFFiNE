import { useEffect, useSyncExternalStore } from 'react';

import type { AIChatRuntime } from './runtime';

/**
 * Initializes and owns the passed runtime for the current React mount.
 */
export function useAIChatRuntime(runtime: AIChatRuntime | null) {
  const snapshot = useSyncExternalStore(
    runtime?.subscribe ?? (() => () => {}),
    runtime?.getSnapshot ?? (() => null),
    runtime?.getSnapshot ?? (() => null)
  );

  useEffect(() => {
    if (!runtime) return;
    runtime.dispatch({ type: 'initialize' }).catch(console.error);
    return () => runtime.dispose();
  }, [runtime]);

  return snapshot;
}
