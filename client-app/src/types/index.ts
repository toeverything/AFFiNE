// TODO: find official typings if available
type IsolationPayload = unknown;

declare global {
  interface Window {
    CLIENT_APP?: boolean;
    __TAURI_ISOLATION_HOOK__: (payload: IsolationPayload) => IsolationPayload;
  }
}

export {};
