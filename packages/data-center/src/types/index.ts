// export type WorkspaceInfo = {
//   name: string;
//   id: string;
//   isPublish?: boolean;
//   avatar?: string;
//   owner?: User;
//   isLocal?: boolean;
//   memberCount: number;
//   provider: string;
// };

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/ban-types
    __TAURI_IPC__: Function;
  }
}

export type User = {
  name: string;
  id: string;
  email: string;
  avatar: string;
};

// export type WorkspaceMeta = Pick<WorkspaceInfo, 'name' | 'avatar'>;

export type Logger = typeof import('@affine/debug').DebugLogger;

export type Message = {
  code: number;
  message: string;
  provider: string;
};
