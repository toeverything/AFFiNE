export interface PluginContext {
  /** The name of the plugin */
  header: {
    register: (id: string, element: HTMLElement) => void;
    unregister: (id: string) => void;
  };
}

export interface EntryCleanup {
  (context: PluginContext): void;
}

export interface Entry {
  (context: PluginContext): EntryCleanup;
}
