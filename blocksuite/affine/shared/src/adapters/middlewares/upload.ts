import { sha } from '@blocksuite/global/utils';
import type {
  AfterImportBlockPayload,
  BlockModel,
  BlockProps,
  TransformerMiddleware,
} from '@blocksuite/store';
import { filter, from, map, mergeMap } from 'rxjs';

export const uploadMiddleware =
  (concurrent = 5): TransformerMiddleware =>
  ({ slots, assetsManager }) => {
    async function upload(
      model: BlockModel,
      blob: Blob,
      mapInto: (blobId: string) => Partial<BlockProps>
    ) {
      try {
        const blobId = await sha(await blob.arrayBuffer());

        model.store.withoutTransact(() => {
          model.store.updateBlock(model, mapInto(blobId));
        });

        assetsManager.getAssets().set(blobId, blob);

        await assetsManager.writeToBlob(blobId);

        return blobId;
      } catch (err) {
        console.error(err);

        return null;
      }
    }

    slots.afterImport
      .pipe(
        filter(
          (payload): payload is AfterImportBlockPayload =>
            payload.type === 'block'
        ),
        map(({ model }) => model),
        filter(model =>
          ['affine:attachment', 'affine:image'].includes(model.flavour)
        ),
        map(model => {
          if (!assetsManager.tempAssetsMap.has(model.id)) return null;

          const temp = assetsManager.tempAssetsMap.get(model.id)!;
          const { blob, mapInto } = temp;

          assetsManager.tempAssetsMap.delete(model.id);

          return { model, blob, mapInto };
        }),
        filter(Boolean),
        mergeMap(
          ({ model, blob, mapInto }) => from(upload(model, blob, mapInto)),
          concurrent
        ),
        filter(Boolean)
      )
      .subscribe(blobId => {
        console.debug(`${blobId} upload successfully`);
      });
  };
