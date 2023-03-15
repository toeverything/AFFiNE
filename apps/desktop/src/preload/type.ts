declare global {
  // eslint-disable-next-line no-var
  var __editoVersion: unknown;

  interface Window {
    CLIENT_APP?: boolean;
    __TAURI_ISOLATION_HOOK_: (payload: any) => any;
  }
}

export {};
