/* eslint-disable @typescript-eslint/consistent-type-imports */
// This file contains the main process events
// It will guide preload and main process on the correct event types and payloads

export type MainIPCHandlerMap = typeof import('./main/src/exposed').handlers;

export type MainIPCEventMap = typeof import('./main/src/exposed').events;
