const setScope = (scope: string) =>
  document.body.setAttribute(`data-${scope}`, '');
const rmScope = (scope: string) =>
  document.body.removeAttribute(`data-${scope}`);

export async function startViewTransition(cb: () => Promise<void> | void) {
  if (typeof document === 'undefined') return;

  if (typeof document.startViewTransition !== 'function') {
    await cb();
    return;
  }

  const transition = document.startViewTransition(cb);
  // Skipping the animation rejects ready even when the DOM update succeeds.
  void transition.ready.catch(() => {});
  await transition.finished;
}

/**
 * A wrapper around `document.startViewTransition` that adds a scope attribute to the body element.
 */
export function startScopedViewTransition(
  scope: string | string[],
  cb: () => Promise<void> | void,
  options?: { timeout?: number }
) {
  if (typeof document === 'undefined') return;

  if (typeof document.startViewTransition === 'function') {
    const scopes = Array.isArray(scope) ? scope : [scope];
    const timeout = options?.timeout ?? 2000;

    scopes.forEach(setScope);

    const finished = startViewTransition(cb);
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('View transition timeout')), timeout);
    });

    Promise.race([finished, timeoutPromise])
      .catch(err => console.error(`View transition[${scope}] failed: ${err}`))
      .finally(() => scopes.forEach(rmScope));
  } else {
    startViewTransition(cb).catch(console.error);
  }
}

export function vtScopeSelector(scope: string) {
  return `[data-${scope}]`;
}
