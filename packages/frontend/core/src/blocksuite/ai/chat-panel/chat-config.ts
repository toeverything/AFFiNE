import type { Signal } from '@preact/signals-core';

export interface AppSidebarConfig {
  getWidth: () => {
    signal: Signal<number | undefined>;
    cleanup: () => void;
  };
  isOpen: () => {
    signal: Signal<boolean | undefined>;
    cleanup: () => void;
  };
}
