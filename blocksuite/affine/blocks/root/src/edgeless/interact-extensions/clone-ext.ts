import { getCommonBoundWithRotation } from '@blocksuite/global/gfx';
import { type GfxModel, InteractivityExtension } from '@blocksuite/std/gfx';

import { createElementsFromClipboardDataCommand } from '../clipboard/command.js';
import { prepareCloneData } from '../utils/clone-utils.js';

export class AltCloneExtension extends InteractivityExtension {
  static override key = 'alt-clone';

  override mounted(): void {
    this.action.onRequestElementsClone(async context => {
      const { elements: elementsToClone } = context;
      const snapshot = prepareCloneData(elementsToClone, this.std);

      const bound = getCommonBoundWithRotation(elementsToClone);
      const [_, { createdElementsPromise }] = this.std.command.exec(
        createElementsFromClipboardDataCommand,
        {
          elementsRawData: snapshot,
          pasteCenter: bound.center,
        }
      );

      if (!createdElementsPromise) return;
      const { canvasElements, blockModels } = await createdElementsPromise;

      return {
        elements: [...canvasElements, ...blockModels] as GfxModel[],
      };
    });
  }
}
