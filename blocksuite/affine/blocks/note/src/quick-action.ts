import {
  convertSelectedBlocksToLinkedDoc,
  getTitleFromSelectedModels,
  notifyDocCreated,
  promptDocTitle,
} from '@blocksuite/affine-block-embed';
import {
  draftSelectedModelsCommand,
  getSelectedModelsCommand,
} from '@blocksuite/affine-shared/commands';
import type { BlockStdScope } from '@blocksuite/std';
import { toDraftModel } from '@blocksuite/store';

export interface QuickActionConfig {
  id: string;
  hotkey?: string;
  showWhen: (std: BlockStdScope) => boolean;
  action: (std: BlockStdScope) => void;
}

export const quickActionConfig: QuickActionConfig[] = [
  {
    id: 'convert-to-linked-doc',
    hotkey: `Mod-Shift-l`,
    showWhen: std => {
      const [_, ctx] = std.command.exec(getSelectedModelsCommand, {
        types: ['block'],
      });
      const { selectedModels } = ctx;
      return !!selectedModels && selectedModels.length > 0;
    },
    action: std => {
      const [_, ctx] = std.command
        .chain()
        .pipe(getSelectedModelsCommand, {
          types: ['block'],
          mode: 'flat',
        })
        .pipe(draftSelectedModelsCommand)
        .run();
      const { selectedModels, draftedModels } = ctx;
      if (!selectedModels) return;

      if (!selectedModels.length || !draftedModels) return;

      std.selection.clear();

      const doc = std.store;
      const autofill = getTitleFromSelectedModels(
        selectedModels.map(toDraftModel)
      );
      promptDocTitle(std, autofill)
        .then(title => {
          if (title === null) return;
          convertSelectedBlocksToLinkedDoc(
            std,
            doc,
            draftedModels,
            title
          ).catch(console.error);
          notifyDocCreated(std);
        })
        .catch(console.error);
    },
  },
];
