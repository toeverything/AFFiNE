import { ipcRenderer } from 'electron';

import { AFFINE_WORKER_CONNECT_CHANNEL_NAME } from '../../ipc/constant';

export function listenWorkerApis() {
  ipcRenderer.on(AFFINE_WORKER_CONNECT_CHANNEL_NAME, (ev, data) => {
    const portForRenderer = ev.ports[0];

    // @ts-expect-error this function should only be evaluated in the renderer process
    if (document.readyState === 'complete') {
      // @ts-expect-error this function should only be evaluated in the renderer process
      window.postMessage(
        {
          type: 'electron:worker-connect',
          portId: data.portId,
        },
        '*',
        [portForRenderer]
      );
    } else {
      // @ts-expect-error this function should only be evaluated in the renderer process
      window.addEventListener('load', () => {
        // @ts-expect-error this function should only be evaluated in the renderer process
        window.postMessage(
          {
            type: 'electron:worker-connect',
            portId: data.portId,
          },
          '*',
          [portForRenderer]
        );
      });
    }
  });
}
