import { type Block, diffMarkdown } from './markdown-diff';

export interface RenderDiffs {
  deletes: string[];
  inserts: Record<string, Block[]>;
  updates: Record<string, string>;
}

/**
 * Example:
 *
 * Old markdown:
 * ```md
 *   <!-- block_id=001 flavour=paragraph -->
 *   This is the first paragraph
 *
 *   <!-- block_id=002 flavour=paragraph -->
 *   This is the second paragraph
 *
 *   <!-- block_id=003 flavour=paragraph -->
 *   This is the third paragraph
 *
 *   <!-- block_id=004 flavour=paragraph -->
 *   This is the fourth paragraph
 * ```
 *
 * New markdown:
 * ```md
 *   <!-- block_id=001 flavour=paragraph -->
 *   This is the first paragraph
 *
 *   <!-- block_id=003 flavour=paragraph -->
 *   This is the 3rd paragraph
 *
 *   <!-- block_id=005 flavour=paragraph -->
 *   New inserted paragraph 1
 *
 *   <!-- block_id=006 flavour=paragraph -->
 *   New inserted paragraph 2
 * ```
 *
 * The generated patches:
 * ```js
 *   [
 *     { op: 'insert', index: 2, block: { id: '005', ... } },
 *     { op: 'insert', index: 3, bthirdlock: { id: '006', ... } },
 *     { op: 'update', id: '003', content: 'This is the 3rd paragraph' },
 *     { op: 'delete', id: '002' },
 *     { op: 'delete', id: '004' }
 *   ]
 * ```
 *
 * UI expected:
 * ```
 * This is the first paragraph
 * [DELETE DIFF] This is the second paragraph
 * This is the third paragraph
 * [DELETE DIFF] This is the fourth paragraph
 * [INSERT DIFF] New inserted paragraph 1
 * [INSERT DIFF] New inserted paragraph 2
 * ```
 *
 * The resulting diffMap:
 * ```js
 *   {
 *     deletes: ['002', '004'],
 *     inserts: { 3: [block_005, block_006] },
 *     updates: {}
 *   }
 * ```
 */
export function generateRenderDiff(
  originalMarkdown: string,
  changedMarkdown: string
) {
  const { patches, oldBlocks } = diffMarkdown(
    originalMarkdown,
    changedMarkdown
  );

  const diffMap: RenderDiffs = {
    deletes: [],
    inserts: {},
    updates: {},
  };

  const indexToBlockId: Record<number, string> = {};
  oldBlocks.forEach((block, idx) => {
    indexToBlockId[idx] = block.id;
  });

  function getPrevBlock(index: number) {
    let start = index - 1;
    while (!indexToBlockId[start] && start >= 0) {
      start--;
    }
    return indexToBlockId[start] || 'HEAD';
  }

  const insertGroups: Record<string, Block[]> = {};
  let lastInsertKey: string | null = null;
  let lastInsertIndex: number | null = null;

  for (const patch of patches) {
    switch (patch.op) {
      case 'delete':
        diffMap.deletes.push(patch.id);
        break;
      case 'insert': {
        const prevBlockId = getPrevBlock(patch.index);
        if (
          lastInsertKey !== null &&
          lastInsertIndex !== null &&
          patch.index === lastInsertIndex + 1
        ) {
          insertGroups[lastInsertKey].push(patch.block);
        } else {
          insertGroups[prevBlockId] = [patch.block];
          lastInsertKey = prevBlockId;
        }
        lastInsertIndex = patch.index;
        break;
      }
      case 'replace':
        diffMap.updates[patch.id] = patch.content;
        break;
    }
  }

  diffMap.inserts = insertGroups;

  return diffMap;
}
