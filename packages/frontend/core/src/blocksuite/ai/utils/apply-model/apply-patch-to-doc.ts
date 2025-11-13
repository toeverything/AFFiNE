import type { Store } from '@blocksuite/store';

import { insertFromMarkdown, replaceFromMarkdown } from '../../../utils';
import type { PatchOp } from './markdown-diff';

/**
 * Apply a list of PatchOp to the page doc (children of the first note block)
 * @param doc The page document Store
 * @param patch Array of PatchOp
 */
export async function applyPatchToDoc(
  doc: Store,
  patch: PatchOp[]
): Promise<void> {
  // Get all note blocks
  const notes = doc.getBlocksByFlavour('affine:note');
  if (notes.length === 0) return;
  // Only handle the first note block
  const note = notes[0].model;

  // Build a map from block_id to BlockModel for quick lookup
  const blockIdMap = new Map<string, any>();
  note.children.forEach(child => {
    blockIdMap.set(child.id, child);
  });

  for (const op of patch) {
    if (op.op === 'delete') {
      // Delete block
      doc.deleteBlock(op.id);
    } else if (op.op === 'replace') {
      const oldBlock = blockIdMap.get(op.id);
      if (!oldBlock) continue;
      const parentId = note.id;
      const index = note.children.findIndex(child => child.id === op.id);
      if (index === -1) continue;

      await replaceFromMarkdown(
        undefined,
        op.content,
        doc,
        parentId,
        index,
        op.id
      );
    } else if (op.op === 'insert') {
      // Insert new block
      const parentId = note.id;
      const index = op.index;
      await insertFromMarkdown(
        undefined,
        op.block.content,
        doc,
        parentId,
        index,
        op.block.id
      );
    }
  }
}
