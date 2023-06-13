declare namespace PeersAPIs {
  import type { app, dialog, shell } from 'electron';

  interface ExposedMeta {
    handlers: [string, string[]][];
    events: [string, string[]][];
  }

  // render <-> helper
  interface RendererToHelper {
    postEvent: (channel: string, ...args: any[]) => void;
  }

  interface HelperToRenderer {
    [key: string]: (...args: any[]) => Promise<any>;
  }

  // helper <-> main
  interface HelperToMain {
    getMeta: () => ExposedMeta;
  }

  type MainToHelper = Pick<
    typeof dialog & typeof shell & typeof app,
    | 'showOpenDialog'
    | 'showSaveDialog'
    | 'openExternal'
    | 'showItemInFolder'
    | 'getPath'
  >;

  // render <-> main
  // these are handled via IPC
  // TODO: fix type
}
