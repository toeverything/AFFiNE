/* eslint-disable @typescript-eslint/consistent-type-imports */
// This file contains the main process events
// It will guide preload and main process on the correct event types and payloads

declare type MainIPCHandlerMap = typeof import('./main/src/exposed').handlers;

declare type MainIPCEventMap = typeof import('./main/src/exposed').events;
