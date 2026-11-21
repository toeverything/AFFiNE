// @affine/core (where the rest of this app's bootstrap logic lives) is
// shared across the electron/desktop/ios/android app-shell targets too,
// none of which should get a service worker — see
// _bmad-output/specs/spec-pwa-conversion/SPEC.md's Constraints. That's why
// this file lives here (and in packages/frontend/apps/web, duplicated)
// rather than in @affine/core.

export interface ServiceWorkerUpdateHandlers {
  /**
   * Fires when a new service worker has finished installing and is sitting
   * in the "waiting" state — i.e. a new build shipped while this tab was
   * open. It does NOT activate automatically (see service-worker.ts's
   * install handler) so the caller can prompt the user before switching
   * them onto new JS. See CAP-3 in _bmad-output/specs/spec-pwa-conversion/SPEC.md.
   */
  onUpdateWaiting?: (registration: ServiceWorkerRegistration) => void;
}

export function registerServiceWorker(
  handlers: ServiceWorkerUpdateHandlers = {}
) {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(registration => {
        // A worker was already waiting when this page loaded — e.g. this
        // tab has been open since before the most recent deploy.
        if (registration.waiting) {
          handlers.onUpdateWaiting?.(registration);
        }
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) {
            return;
          }
          installing.addEventListener('statechange', () => {
            // 'installed' plus an existing controller means this is an
            // update to an already-controlled page (not the very first
            // install ever) — the new worker is now waiting.
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              handlers.onUpdateWaiting?.(registration);
            }
          });
        });
      })
      .catch(error =>
        console.error('Service worker registration failed', error)
      );
  });
}

/**
 * Tells a waiting service worker to activate, and resolves once it has
 * taken control of this page. The caller is expected to reload the page
 * immediately after this resolves — this function does not reload itself,
 * since the caller (the update banner) is what decides when that happens.
 */
export function activateWaitingServiceWorker(
  registration: ServiceWorkerRegistration
): Promise<void> {
  return new Promise(resolve => {
    if (!registration.waiting) {
      resolve();
      return;
    }
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => resolve(),
      { once: true }
    );
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}
