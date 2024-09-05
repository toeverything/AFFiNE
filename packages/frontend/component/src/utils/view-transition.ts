const setScope = (scope: string) =>
  document.body.setAttribute(`data-${scope}`, '');
const rmScope = (scope: string) =>
  document.body.removeAttribute(`data-${scope}`);

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

    const vt = document.startViewTransition(cb);
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('View transition timeout')), timeout);
    });

    Promise.race([vt.finished, timeoutPromise])
      .catch(err => console.error(`View transition[${scope}] failed: ${err}`))
      .finally(() => scopes.forEach(rmScope));
  } else {
    cb()?.catch(console.error);
  }
}

export function vtScopeSelector(scope: string) {
  return `[data-${scope}]`;
}
