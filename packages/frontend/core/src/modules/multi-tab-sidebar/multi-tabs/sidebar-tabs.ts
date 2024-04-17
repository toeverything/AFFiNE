import type { SidebarTab } from './sidebar-tab';
import { chatTab } from './tabs/chat';
import { framePanelTab } from './tabs/frame';
import { journalTab } from './tabs/journal';
import { outlineTab } from './tabs/outline';

// the list of all possible tabs in affine.
// order matters (determines the order of the tabs)
export const sidebarTabs: SidebarTab[] = [
  chatTab,
  journalTab,
  outlineTab,
  framePanelTab,
];
