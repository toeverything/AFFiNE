/**
 * Runs a promise for its side effect when the caller cannot await it (Lit
 * lifecycle hooks, event handlers, toolbar actions).
 *
 * A bare `void promise` is rejected by the repo lint config precisely because
 * it swallows rejections silently, so failures are routed to the console here.
 */
export function detach(promise: Promise<unknown> | undefined | null): void {
  promise?.catch((error: unknown) => {
    console.error(error);
  });
}
