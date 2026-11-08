import type { PluginListenerHandle } from '@capacitor/core';

export interface NavigationGesturePlugin {
  isEnabled: () => Promise<boolean>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  addListener(
    event: 'gesture',
    listener: (event: {
      phase: 'begin' | 'progress' | 'commit' | 'cancel';
      progress: number;
    }) => void
  ): Promise<PluginListenerHandle>;
}
