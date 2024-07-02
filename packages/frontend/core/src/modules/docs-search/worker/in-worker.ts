import type { AffineTextAttributes } from '@blocksuite/blocks';
import type { DeltaInsert } from '@blocksuite/inline';
import { Document } from '@toeverything/infra';
import { difference } from 'lodash-es';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  Map as YMap,
  type Text as YText,
} from 'yjs';

import type { BlockIndexSchema, docIndexSchema } from '../schema';
import type {
  WorkerIngoingMessage,
  WorkerInput,
  WorkerOutgoingMessage,
  WorkerOutput,
} from './types';

function crawlingDocData({
  docBuffer,
  docId,
  rootDocBuffer,
}: WorkerInput & { type: 'doc' }): WorkerOutput {
  const yRootDoc = new YDoc();
  applyUpdate(yRootDoc, rootDocBuffer);

  const ydoc = new YDoc();

  applyUpdate(ydoc, docBuffer);

  let docExists: boolean | null = null;

  (
    yRootDoc.getMap('meta').get('pages') as YArray<YMap<any>> | undefined
  )?.forEach(page => {
    if (page.get('id') === docId) {
      docExists = !(page.get('trash') ?? false);
    }
  });

  if (!docExists) {
    return {
      deletedDoc: [docId],
    };
  } else {
    const blocks = ydoc.getMap<any>('blocks');

    if (blocks.size === 0) {
      return {};
    }

    let docTitle = '';

    const blockDocuments: Document<BlockIndexSchema>[] = [];

    for (const block of blocks.values()) {
      const flavour = block.get('sys:flavour')?.toString();
      const blockId = block.get('sys:id')?.toString();

      if (!flavour || !blockId) {
        continue;
      }

      if (flavour === 'affine:page') {
        docTitle = block.get('prop:title').toString();
        blockDocuments.push(
          Document.from(`${docId}:${blockId}`, {
            docId,
            flavour,
            blockId,
            content: docTitle,
          })
        );
      }

      if (
        flavour === 'affine:paragraph' ||
        flavour === 'affine:list' ||
        flavour === 'affine:code'
      ) {
        const text = block.get('prop:text') as YText;
        if (!text) {
          continue;
        }

        const deltas: DeltaInsert<AffineTextAttributes>[] = text.toDelta();
        const ref = deltas
          .map(delta => {
            if (
              delta.attributes &&
              delta.attributes.reference &&
              delta.attributes.reference.pageId
            ) {
              return delta.attributes.reference.pageId;
            }
            return null;
          })
          .filter((link): link is string => !!link);

        blockDocuments.push(
          Document.from<BlockIndexSchema>(`${docId}:${blockId}`, {
            docId,
            flavour,
            blockId,
            content: text.toString(),
            ref,
          })
        );
      }

      if (
        flavour === 'affine:embed-linked-doc' ||
        flavour === 'affine:embed-synced-doc'
      ) {
        const pageId = block.get('prop:pageId');
        if (typeof pageId === 'string') {
          blockDocuments.push(
            Document.from<BlockIndexSchema>(`${docId}:${blockId}`, {
              docId,
              flavour,
              blockId,
              ref: pageId,
            })
          );
        }
      }

      if (flavour === 'affine:attachment' || flavour === 'affine:image') {
        const blobId = block.get('prop:sourceId');
        if (typeof blobId === 'string') {
          blockDocuments.push(
            Document.from<BlockIndexSchema>(`${docId}:${blockId}`, {
              docId,
              flavour,
              blockId,
              blob: [blobId],
            })
          );
        }
      }

      if (flavour === 'affine:surface') {
        const texts = [];

        const elementsObj = block.get('prop:elements');
        if (
          !(
            elementsObj instanceof YMap &&
            elementsObj.get('type') === '$blocksuite:internal:native$'
          )
        ) {
          continue;
        }
        const elements = elementsObj.get('value') as YMap<any>;
        if (!(elements instanceof YMap)) {
          continue;
        }

        for (const element of elements.values()) {
          if (!(element instanceof YMap)) {
            continue;
          }
          const text = element.get('text') as YText;
          if (!text) {
            continue;
          }

          texts.push(text.toString());
        }

        blockDocuments.push(
          Document.from<BlockIndexSchema>(`${docId}:${blockId}`, {
            docId,
            flavour,
            blockId,
            content: texts,
          })
        );
      }

      if (flavour === 'affine:database') {
        const texts = [];
        const columnsObj = block.get('prop:columns');
        if (!(columnsObj instanceof YArray)) {
          continue;
        }
        for (const column of columnsObj) {
          if (!(column instanceof YMap)) {
            continue;
          }
          if (typeof column.get('name') === 'string') {
            texts.push(column.get('name'));
          }

          const data = column.get('data');
          if (!(data instanceof YMap)) {
            continue;
          }
          const options = data.get('options');
          if (!(options instanceof YArray)) {
            continue;
          }
          for (const option of options) {
            if (!(option instanceof YMap)) {
              continue;
            }
            const value = option.get('value');
            if (typeof value === 'string') {
              texts.push(value);
            }
          }
        }

        blockDocuments.push(
          Document.from<BlockIndexSchema>(`${docId}:${blockId}`, {
            docId,
            flavour,
            blockId,
            content: texts,
          })
        );
      }
    }

    return {
      addedDoc: [
        {
          id: docId,
          doc: Document.from<typeof docIndexSchema>(docId, {
            title: docTitle,
          }),
          blocks: blockDocuments,
        },
      ],
    };
  }
}

function crawlingRootDocData({
  allIndexedDocs,
  rootDocBuffer,
}: WorkerInput & {
  type: 'rootDoc';
}): WorkerOutput {
  const ydoc = new YDoc();

  applyUpdate(ydoc, rootDocBuffer);

  const docs = ydoc.getMap('meta').get('pages') as
    | YArray<YMap<any>>
    | undefined;

  if (!docs) {
    return {};
  }

  const availableDocs = [];

  for (const page of docs) {
    const docId = page.get('id');

    if (typeof docId !== 'string') {
      continue;
    }

    const inTrash = page.get('trash') ?? false;

    if (!inTrash) {
      availableDocs.push(docId);
    }
  }

  const needDelete = difference(allIndexedDocs, availableDocs);
  const needAdd = difference(availableDocs, allIndexedDocs);

  return {
    reindexDoc: [...needAdd, ...needDelete].map(docId => ({
      docId,
      storageDocId: ydoc.getMap<YDoc>('spaces').get(docId)?.guid ?? docId,
    })),
  };
}

globalThis.onmessage = (event: MessageEvent<WorkerIngoingMessage>) => {
  const message = event.data;
  if (message.type === 'init') {
    postMessage({ type: 'init', msgId: message.msgId });
    return;
  }
  if (message.type === 'run') {
    const { input } = message;
    try {
      let data;
      if (input.type === 'rootDoc') {
        data = crawlingRootDocData(input);
      } else {
        data = crawlingDocData(input);
      }

      postMessage({ type: 'done', msgId: message.msgId, output: data });
    } catch (error) {
      postMessage({
        type: 'failed',
        msgId: message.msgId,
        error: error instanceof Error ? error.message : error + '',
      });
    }
  }
};

declare function postMessage(message: WorkerOutgoingMessage): void;
