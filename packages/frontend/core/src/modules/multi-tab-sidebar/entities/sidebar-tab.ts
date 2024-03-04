import type { AffineEditorContainer } from '@blocksuite/presets';

export type SidebarTabName = 'outline' | 'frame' | 'copilot' | 'journal';

export interface SidebarTabProps {
  editor: AffineEditorContainer | null;
}

export interface SidebarTab {
  name: SidebarTabName;
  icon: React.ReactNode;
  Component: React.ComponentType<SidebarTabProps>;
}
