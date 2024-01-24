import type { BlockSuiteWorkspace } from '@affine/core/shared';
import type { Page } from '@blocksuite/store';

export type EditorExtensionName = 'outline' | 'frame' | 'copilot' | 'journal';

export interface EditorExtensionProps {
  workspace: BlockSuiteWorkspace;
  page: Page;
}

export interface EditorExtension {
  name: EditorExtensionName;
  icon: React.ReactNode;
  Component: React.ComponentType<EditorExtensionProps>;
}
