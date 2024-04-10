import type { AffineEditorContainer } from '@blocksuite/presets';

export type SidebarTabName = 'outline' | 'frame' | 'chat' | 'journal';

export interface SidebarTabProps {
  editor: AffineEditorContainer | null;
}

export interface SidebarTab {
  name: SidebarTabName;
  icon: React.ReactNode;
  Component: React.ComponentType<SidebarTabProps>;
}
