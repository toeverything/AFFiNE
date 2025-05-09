import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

export interface SidebarService {
  open: (tabId?: string) => void;
  close: () => void;
  getTabIds: () => string[];
}

export const SidebarExtensionIdentifier = createIdentifier<SidebarService>(
  'AffineSidebarExtension'
);

export const SidebarExtension = (service: SidebarService): ExtensionType => ({
  setup: di => {
    di.addImpl(SidebarExtensionIdentifier, () => service);
  },
});
