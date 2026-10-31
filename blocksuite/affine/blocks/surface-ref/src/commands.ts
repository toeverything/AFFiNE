import { EdgelessCRUDExtension } from '@blocksuite/affine-block-surface';
import { toast } from '@blocksuite/affine-components/toast';
import { type SurfaceRefProps } from '@blocksuite/affine-model';
import {
  ensureDocLoaded,
  waitForBlockInDoc,
} from '@blocksuite/affine-shared/utils';
import type { Command } from '@blocksuite/std';
import { GfxPrimitiveElementModel } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

export const insertSurfaceRefBlockCommand: Command<
  {
    reference: string;
    place: 'after' | 'before';
    removeEmptyLine?: boolean;
    selectedModels?: BlockModel[];
    // Set for a cross-doc reference (Story 0.3): `reference` lives in
    // `refDocId`, not the current doc, so it can't be resolved via this
    // doc's own `EdgelessCRUDExtension` — the caller (the cross-doc picker)
    // already knows the flavour, so it's passed in directly instead.
    refDocId?: string;
    refFlavour?: string;
  },
  {
    insertedSurfaceRefBlockId: string;
  }
> = (ctx, next) => {
  const {
    selectedModels,
    reference,
    place,
    removeEmptyLine,
    refDocId,
    refFlavour,
    std,
  } = ctx;
  if (!selectedModels?.length) return;

  const targetModel =
    place === 'before'
      ? selectedModels[0]
      : selectedModels[selectedModels.length - 1];

  const surfaceRefProps: Partial<SurfaceRefProps> & {
    flavour: 'affine:surface-ref';
  } = {
    flavour: 'affine:surface-ref',
    reference,
    refDocId,
  };

  if (refDocId) {
    if (!refFlavour) {
      console.error('refFlavour is required when refDocId is set');
      return;
    }
    surfaceRefProps.refFlavour = refFlavour;

    // Kick off loading the target doc as early as possible — its content
    // streams in asynchronously (a doc the user hasn't opened this session
    // can take a real amount of time), and the renderer's own retry only
    // starts once the block actually mounts. Starting the load here shaves
    // that delay down instead of waiting for the mount to even begin it.
    //
    // This trusts the picker's candidate rather than validating it exists
    // synchronously (that would break the cold-doc case above) — instead,
    // `waitForBlockInDoc` verifies it in the background and surfaces a
    // toast if a stale/deleted candidate never actually materializes,
    // rather than failing silently forever.
    const refDoc = std.workspace.getDoc(refDocId);
    if (refDoc) {
      ensureDocLoaded(refDoc);
      waitForBlockInDoc(refDoc, reference)
        .then(found => {
          if (!found) {
            toast(std.host, 'The referenced frame could not be found.');
          }
        })
        .catch(() => {
          // best-effort verification only; insertion already succeeded
        });
    }
  } else {
    const crud = std.get(EdgelessCRUDExtension);
    const element = crud.getElementById(reference);

    if (!element) {
      console.error(`reference not found ${reference}`);
      return;
    }

    surfaceRefProps.refFlavour =
      element instanceof GfxPrimitiveElementModel
        ? element.type
        : element.flavour;
  }

  const result = std.store.addSiblingBlocks(
    targetModel,
    [surfaceRefProps],
    place
  );
  if (result.length === 0) return;

  if (removeEmptyLine && targetModel.text?.length === 0) {
    std.store.deleteBlock(targetModel);
  }

  next({
    insertedSurfaceRefBlockId: result[0],
  });
};
