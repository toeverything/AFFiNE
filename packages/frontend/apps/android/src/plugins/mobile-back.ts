import type { PluginListenerHandle } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

type MobileBackEvent = {
  phase: 'begin' | 'progress' | 'cancel' | 'commit';
  progress?: number;
};

type MobileBackPlugin = {
  setEnabled(options: { enabled: boolean }): Promise<void>;
  addListener(
    event: 'back',
    listener: (event: MobileBackEvent) => void
  ): Promise<PluginListenerHandle>;
};

export const MobileBack = registerPlugin<MobileBackPlugin>('MobileBack');
