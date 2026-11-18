import { notify } from '@affine/component';

import {
  activateWaitingServiceWorker,
  registerServiceWorker,
} from './register-service-worker';

/**
 * Registers the service worker and shows a persistent "new version
 * available" banner when an update is waiting — the user chooses when to
 * reload, so an in-progress edit is never interrupted by new code swapping
 * in underneath it. See CAP-3 in
 * _bmad-output/specs/spec-pwa-conversion/SPEC.md.
 */
export function registerServiceWorkerWithUpdateNotice() {
  registerServiceWorker({
    onUpdateWaiting: registration => {
      notify(
        {
          title: 'New version available',
          message: 'Reload to update AFFiNE to the latest version.',
          actions: [
            {
              key: 'reload',
              label: 'Reload',
              autoClose: true,
              onClick: async () => {
                await activateWaitingServiceWorker(registration);
                window.location.reload();
              },
            },
          ],
        },
        // Never auto-dismiss — the user decides when to reload, not a timer.
        { duration: Infinity }
      );
    },
  });
}
