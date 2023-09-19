import type { Page } from '@blocksuite/store';
import { AffineCommandRegistry } from '@toeverything/infra/command';

interface CommandContext {
  currentPage: Page | undefined;
  pageMode: 'paper' | 'edgeless'
}

export const getCommands = () => {
  return AffineCommandRegistry.getAll();
};

