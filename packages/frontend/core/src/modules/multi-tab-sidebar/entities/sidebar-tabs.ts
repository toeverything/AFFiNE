import type { SidebarTab } from './sidebar-tab';
import { copilotTab } from './tabs/copilot';
import { framePanelTab } from './tabs/frame';
import { journalTab } from './tabs/journal';
import { outlineTab } from './tabs/outline';

// the list of all possible tabs in affine.
// order matters (determines the order of the tabs)
export const sidebarTabs: SidebarTab[] = [
  journalTab,
  outlineTab,
  framePanelTab,
  copilotTab,
];
