import { ipcRenderer } from 'electron';

export function listenWorkerApis() {
  ipcRenderer.on('worker-connect', (ev, data) => {
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
