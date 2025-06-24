import { ipcRenderer } from 'electron';

import { AFFINE_IPC_EVENT_CHANNEL_NAME } from '../../ipc/constant';
import { eventsMeta } from './ipc-meta.gen';

// --- Main Process Event Handling ---
// Map to store all listeners by their full channel name
const mainListenersMap = new Map<string, Set<(...args: any[]) => void>>();

// Set up a single listener for all main process events
ipcRenderer.on(
  AFFINE_IPC_EVENT_CHANNEL_NAME,
  (_event: Electron.IpcRendererEvent, channel: string, ...args: any[]) => {
    // Get all callbacks registered for this specific channel
    const callbacks = mainListenersMap.get(channel);
    if (callbacks) {
      callbacks.forEach(callback => callback(...args));
    }
  }
);

const createMainEventHandler = (scope: string, eventName: string) => {
  const channel = `${scope}:${eventName}`;

  return (callback: (...args: any[]) => void): (() => void) => {
    // Get or create the set of callbacks for this channel
    if (!mainListenersMap.has(channel)) {
      mainListenersMap.set(channel, new Set());
    }

    const callbacks = mainListenersMap.get(channel);
    if (callbacks) {
      callbacks.add(callback);
    }

    // Return an unsubscribe function
    return () => {
      const callbacks = mainListenersMap.get(channel);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          mainListenersMap.delete(channel);
        }
      }
    };
  };
};

// const createHelperEventHandler = (scope: string, eventName: string) => {
//   const channel = `${scope}:${eventName}`;

//   return (callback: (...args: any[]) => void): (() => void) => {
//     // Subscribe to the helper events subject
//     const subscription = helperEvents$.subscribe(
//       ({ channel: eventChannel, args }) => {
//         if (eventChannel === channel) {
//           callback(...args);
//         }
//       }
//     );

//     // Return an unsubscribe function
//     return () => {
//       subscription.unsubscribe();
//     };
//   };
// };

// --- Process main events ---
const mainEvents = Object.fromEntries(
  Object.entries(eventsMeta.main).map(([scope, eventNames]) => [
    scope,
    Object.fromEntries(
      (eventNames as readonly string[]).map(eventName => {
        // Construct the public method name, e.g., onMaximized
        const onMethodName = `on${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`;
        return [onMethodName, createMainEventHandler(scope, eventName)];
      })
    ),
  ])
);

// TODO: Implement helper events?
// const helperEvents = Object.fromEntries(
//   Object.entries(eventsMeta.helper).map(([scope, eventNames]) => [
//     scope,
//     Object.fromEntries(
//       (eventNames as readonly string[]).map(eventName => {
//         // Construct the public method name, e.g., onMaximized
//         const onMethodName = `on${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`;
//         return [onMethodName, createHelperEventHandler(scope, eventName)];
//       })
//     ),
//   ])
// );

// --- Combine all events ---
export const exposedEvents = {
  ...mainEvents,
  // ...helperEvents,
};
