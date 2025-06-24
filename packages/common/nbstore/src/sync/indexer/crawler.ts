import { readAllBlocksFromDoc } from '@affine/reader';
import { type Doc as YDoc } from 'yjs';

import { IndexerDocument } from '../../storage';

export async function crawlingDocData({
  ydoc,
  rootYDoc,
  spaceId,
  docId,
}: {
  ydoc: YDoc;
  rootYDoc: YDoc;
  spaceId: string;
  docId: string;
}): Promise<
  | {
      blocks: IndexerDocument<'block'>[];
      preview?: string;
    }
  | undefined
> {
  const result = await readAllBlocksFromDoc({
    ydoc,
    rootYDoc,
    spaceId,
    maxSummaryLength: 1000,
  });
  if (!result) {
    return undefined;
  }

  return {
    blocks: result.blocks.map(block =>
      IndexerDocument.from<'block'>(`${docId}:${block.blockId}`, {
        docId: block.docId,
        blockId: block.blockId,
        content: block.content,
        flavour: block.flavour,
        blob: block.blob,
        refDocId: block.refDocId,
        ref: block.ref,
        parentFlavour: block.parentFlavour,
        parentBlockId: block.parentBlockId,
        additional: block.additional
          ? JSON.stringify(block.additional)
          : undefined,
        markdownPreview: block.markdownPreview,
      })
    ),
    preview: result.summary,
  };
}
