/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-restricted-imports */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// @ts-nocheck
// TODO: remove this file after blocksuite exposed it
import type {
  DatabaseBlockModel,
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/blocks/dist/models.js';
import { assertExists } from '@blocksuite/global/utils';
import type { DeltaOperation, JobMiddleware } from '@blocksuite/store';

export const replaceIdMiddleware: JobMiddleware = ({ slots, collection }) => {
  const idMap = new Map<string, string>();
  slots.afterImport.on(payload => {
    if (
      payload.type === 'block' &&
      payload.snapshot.flavour === 'affine:database'
    ) {
      const model = payload.model as DatabaseBlockModel;
      Object.keys(model.cells).forEach(cellId => {
        if (idMap.has(cellId)) {
          model.cells[idMap.get(cellId)!] = model.cells[cellId];
          delete model.cells[cellId];
        }
      });
    }

    // replace LinkedPage pageId with new id in paragraph blocks
    if (
      payload.type === 'block' &&
      ['affine:paragraph', 'affine:list'].includes(payload.snapshot.flavour)
    ) {
      const model = payload.model as ParagraphBlockModel | ListBlockModel;
      let prev = 0;
      const delta: DeltaOperation[] = [];
      for (const d of model.text.toDelta()) {
        if (d.attributes?.reference?.pageId) {
          if (prev > 0) {
            delta.push({ retain: prev });
          }
          delta.push({
            retain: d.insert.length,
            attributes: {
              reference: {
                ...d.attributes.reference,
                pageId: idMap.get(d.attributes.reference.pageId)!,
              },
            },
          });
          prev = 0;
        } else {
          prev += d.insert.length;
        }
      }
      if (delta.length > 0) {
        model.text.applyDelta(delta);
      }
    }
  });
  slots.beforeImport.on(payload => {
    if (payload.type === 'page') {
      const newId = collection.idGenerator('page');
      idMap.set(payload.snapshot.meta.id, newId);
      payload.snapshot.meta.id = newId;
      return;
    }

    if (payload.type === 'block') {
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
        newId = collection.idGenerator('block');
        idMap.set(original, newId);
      }
      snapshot.id = newId;

      if (snapshot.flavour === 'affine:surface') {
        // Generate new IDs for images and frames in advance.
        snapshot.children.forEach(child => {
          const original = child.id;
          if (idMap.has(original)) {
            newId = idMap.get(original)!;
          } else {
            newId = collection.idGenerator('block');
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
                assertExists(newId, 'reference id must exist');
                connection.id = newId;
              }
              connection = value.target as Record<string, string>;
              if (idMap.has(connection.id)) {
                const newId = idMap.get(connection.id);
                assertExists(newId, 'reference id must exist');
                connection.id = newId;
              }
              break;
            }
            case 'group': {
              const json = value.children.json as Record<string, unknown>;
              Object.entries(json).forEach(([key, value]) => {
                if (idMap.has(key)) {
                  delete json[key];
                  const newKey = idMap.get(key);
                  assertExists(newKey, 'reference id must exist');
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
    }
  });
};
