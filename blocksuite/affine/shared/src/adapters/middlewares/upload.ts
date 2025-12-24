import { sha } from '@blocksuite/global/utils';
import type { BlockStdScope } from '@blocksuite/std';
import type {
  BlockModel,
  BlockProps,
  TransformerMiddleware,
} from '@blocksuite/store';
import { filter, from, map, mergeMap } from 'rxjs';

const ALLOWED_FLAVOURS = new Set(['affine:attachment', 'affine:image']);

export const uploadMiddleware = (
  std: BlockStdScope,
  concurrent = 5
): TransformerMiddleware => {
  const blockView$ = std.view.viewUpdated.pipe(
    filter(payload => payload.type === 'block'),
    filter(payload => ALLOWED_FLAVOURS.has(payload.view.model.flavour))
  );

  return ({ assetsManager }) => {
    async function upload(
      model: BlockModel,
      {
        blob,
        mapInto,
        abortController,
      }: {
        blob: Blob;
        mapInto: (blobId: string) => Partial<BlockProps>;
        abortController?: AbortController;
      }
    ) {
      if (!abortController) return null;

      const signal = abortController.signal;
      if (signal.aborted) return null;

      // Double check
      if (!model.store.hasBlock(model.id)) return null;

      try {
        signal.throwIfAborted();

        const blobId = await Promise.race([
          (async function processUpload() {
            const blobId = await sha(await blob.arrayBuffer());

            assetsManager.getAssets().set(blobId, blob);

            await assetsManager.writeToBlob(blobId);

            return await new Promise<string | null>(resolve => {
              model.store.withoutTransact(() => {
                if (signal.aborted) return resolve(null);

                model.store.updateBlock(model, mapInto(blobId));

                resolve(blobId);
              });
            });
          })(),
          // If the signal is not aborted, it will be in the pending state.
          new Promise<null>(resolve => {
            signal.addEventListener('abort', () => resolve(null), {
              once: true,
            });
            if (signal.aborted) {
              resolve(null);
            }
          }),
        ]);

        return blobId;
      } catch (err) {
        console.error(err);

        return null;
      }
    }

    const blockViewSubscription = blockView$
      .pipe(
        map(payload => {
          if (assetsManager.uploadingAssetsMap.size === 0) return null;

          const model = payload.view.model;
          if (!assetsManager.uploadingAssetsMap.has(model.id)) return null;

          const state = assetsManager.uploadingAssetsMap.get(model.id)!;

          if (payload.method === 'add') {
            state.abortController = new AbortController();
            return { model, state };
          } else {
            state.abortController?.abort();
            assetsManager.uploadingAssetsMap.delete(model.id);
            return null;
          }
        }),
        filter(Boolean),
        mergeMap(
          ({ model, state }) =>
            from(
              upload(model, state).then(() => {
                assetsManager.uploadingAssetsMap.delete(model.id);
              })
            ),
          concurrent
        )
      )
      .subscribe();

    return () => {
      blockViewSubscription.unsubscribe();
    };
  };
};
