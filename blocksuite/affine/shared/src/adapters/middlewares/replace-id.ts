import {
  DatabaseBlockModel,
  EmbedLinkedDocModel,
  EmbedSyncedDocModel,
  ListBlockModel,
  ParagraphBlockModel,
  SurfaceRefBlockModel,
} from '@blocksuite/affine-model';
import { BlockSuiteError } from '@blocksuite/global/exceptions';
import type {
  AfterImportBlockPayload,
  BeforeImportBlockPayload,
  DeltaOperation,
  TransformerMiddleware,
} from '@blocksuite/store';
import { filter, map } from 'rxjs';

import { matchModels } from '../../utils';

export const replaceIdMiddleware =
  (idGenerator: () => string): TransformerMiddleware =>
  ({ slots, docCRUD, assetsManager }) => {
    const idMap = new Map<string, string>();

    // After Import

    const afterImportBlock$ = slots.afterImport.pipe(
      filter(
        (payload): payload is AfterImportBlockPayload =>
          payload.type === 'block'
      ),
      map(({ model }) => model)
    );

    const afterImportBlockSubscription = afterImportBlock$
      .pipe(filter(model => matchModels(model, [DatabaseBlockModel])))
      .subscribe(model => {
        Object.keys(model.props.cells).forEach(cellId => {
          if (idMap.has(cellId)) {
            model.props.cells[idMap.get(cellId)!] = model.props.cells[cellId];
            delete model.props.cells[cellId];
          }
        });
      });

    // replace LinkedPage pageId with new id in paragraph blocks
    const replaceLinkedPageIdSubscription = afterImportBlock$
      .pipe(
        filter(model =>
          matchModels(model, [ParagraphBlockModel, ListBlockModel])
        )
      )
      .subscribe(model => {
        let prev = 0;
        const delta: DeltaOperation[] = [];
        for (const d of model.props.text.toDelta()) {
          if (d.attributes?.reference?.pageId) {
            const newId = idMap.get(d.attributes.reference.pageId);
            if (!newId) {
              prev += d.insert?.length ?? 0;
              continue;
            }

            if (prev > 0) {
              delta.push({ retain: prev });
            }

            delta.push({
              retain: d.insert?.length ?? 0,
              attributes: {
                reference: {
                  ...d.attributes.reference,
                  pageId: newId,
                },
              },
            });
            prev = 0;
          } else {
            prev += d.insert?.length ?? 0;
          }
        }
        if (delta.length > 0) {
          model.props.text.applyDelta(delta);
        }
      });

    const replaceSurfaceRefIdSubscription = afterImportBlock$
      .pipe(filter(model => matchModels(model, [SurfaceRefBlockModel])))
      .subscribe(model => {
        const original = model.props.reference;
        // If there exists a replacement, replace the reference with the new id.
        // Otherwise,
        // 1. If the reference is an affine:frame not in doc, generate a new id.
        // 2. If the reference is graph, keep the original id.
        if (idMap.has(original)) {
          model.props.reference = idMap.get(original)!;
        } else if (
          model.props.refFlavour === 'affine:frame' &&
          !model.store.hasBlock(original)
        ) {
          const newId = idGenerator();
          idMap.set(original, newId);
          model.props.reference = newId;
        }
      });

    // TODO(@fundon): process linked block/element
    const replaceLinkedDocIdSubscription = afterImportBlock$
      .pipe(
        filter(model =>
          matchModels(model, [EmbedLinkedDocModel, EmbedSyncedDocModel])
        )
      )
      .subscribe(model => {
        const original = model.props.pageId;
        // If the pageId is not in the doc, generate a new id.
        // If we already have a replacement, use it.
        if (!docCRUD.get(original)) {
          if (idMap.has(original)) {
            model.props.pageId = idMap.get(original)!;
          } else {
            const newId = idGenerator();
            idMap.set(original, newId);
            model.props.pageId = newId;
          }
        }
      });

    // Before Import

    const beforeImportPageSubscription = slots.beforeImport
      .pipe(filter(payload => payload.type === 'page'))
      .subscribe(payload => {
        if (idMap.has(payload.snapshot.meta.id)) {
          payload.snapshot.meta.id = idMap.get(payload.snapshot.meta.id)!;
          return;
        }
        const newId = idGenerator();
        idMap.set(payload.snapshot.meta.id, newId);
        payload.snapshot.meta.id = newId;
      });

    const beforeImportBlockSubscription = slots.beforeImport
      .pipe(
        filter(
          (payload): payload is BeforeImportBlockPayload =>
            payload.type === 'block'
        )
      )
      .subscribe(payload => {
        const { snapshot } = payload;
        if (snapshot.flavour === 'affine:page') {
          const index = snapshot.children.findIndex(
            c => c.flavour === 'affine:surface'
          );
          if (index !== -1) {
            const [surface] = snapshot.children.splice(index, 1);
            snapshot.children.push(surface);
          }
        }

        const original = snapshot.id;
        let newId: string;
        if (idMap.has(original)) {
          newId = idMap.get(original)!;
        } else {
          newId = idGenerator();
          idMap.set(original, newId);
        }
        snapshot.id = newId;

        // Should be re-paired.
        if (['affine:attachment', 'affine:image'].includes(snapshot.flavour)) {
          if (!assetsManager.uploadingAssetsMap.has(original)) return;

          const data = assetsManager.uploadingAssetsMap.get(original)!;
          assetsManager.uploadingAssetsMap.set(newId, data);
          assetsManager.uploadingAssetsMap.delete(original);
          return;
        }

        if (snapshot.flavour === 'affine:surface') {
          // Generate new IDs for images and frames in advance.
          snapshot.children.forEach(child => {
            const original = child.id;
            if (idMap.has(original)) {
              newId = idMap.get(original)!;
            } else {
              newId = idGenerator();
              idMap.set(original, newId);
            }
          });

          Object.entries(
            snapshot.props.elements as Record<string, Record<string, unknown>>
          ).forEach(([_, value]) => {
            switch (value.type) {
              case 'connector': {
                let connection = value.source as Record<string, string>;
                if (idMap.has(connection.id)) {
                  const newId = idMap.get(connection.id);
                  if (!newId) {
                    throw new BlockSuiteError(
                      BlockSuiteError.ErrorCode.TransformerError,
                      `reference id must exist: ${connection.id}`
                    );
                  }
                  connection.id = newId;
                }
                connection = value.target as Record<string, string>;
                if (idMap.has(connection.id)) {
                  const newId = idMap.get(connection.id);
                  if (!newId) {
                    throw new BlockSuiteError(
                      BlockSuiteError.ErrorCode.TransformerError,
                      `reference id must exist: ${connection.id}`
                    );
                  }
                  connection.id = newId;
                }
                break;
              }
              case 'group': {
                const json = (value.children as Record<string, unknown>)
                  .json as Record<string, unknown>;
                Object.entries(json).forEach(([key, value]) => {
                  if (idMap.has(key)) {
                    delete json[key];
                    const newKey = idMap.get(key);
                    if (!newKey) {
                      throw new BlockSuiteError(
                        BlockSuiteError.ErrorCode.TransformerError,
                        `reference id must exist: ${key}`
                      );
                    }
                    json[newKey] = value;
                  }
                });
                break;
              }
              default:
                break;
            }
          });
        }
      });

    return () => {
      afterImportBlockSubscription.unsubscribe();
      replaceLinkedPageIdSubscription.unsubscribe();
      replaceSurfaceRefIdSubscription.unsubscribe();
      replaceLinkedDocIdSubscription.unsubscribe();
      beforeImportPageSubscription.unsubscribe();
      beforeImportBlockSubscription.unsubscribe();
    };
  };
