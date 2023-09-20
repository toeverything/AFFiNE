import type { Page } from '@blocksuite/store';
import type { CommandCategory } from '@toeverything/infra/command';

export interface CommandContext {
  currentPage: Page | undefined;
  pageMode: 'page' | 'edgeless' | undefined;
}

// similar to AffineCommand, but for rendering into the UI
// it unifies all possible commands into a single type so that
// we can use a single render function to render all different commands
export interface CMDKCommand {
  id: string;
  label: string;
  icon?: React.ReactNode;
  category: CommandCategory;
  keyBinding?: string;
  timestamp?: number;
  value?: string; // this is used for item filtering
  run: (e: Event) => void | Promise<void>;
}
