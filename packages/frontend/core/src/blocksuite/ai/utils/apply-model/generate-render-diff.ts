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
 *
 *   <!-- block_id=005 flavour=paragraph -->
 *   This is the fifth paragraph
 * ```
 *
 * New markdown:
 * ```md
 *   <!-- block_id=001 flavour=paragraph -->
 *   This is the 1st paragraph
 *
 *   <!-- block_id=002 flavour=paragraph -->
 *   This is the second paragraph
 *
 *   <!-- block_id=004 flavour=paragraph -->
 *   This is the fourth paragraph
 *
 *   <!-- block_id=006 flavour=paragraph -->
 *   New inserted paragraph 1
 *
 *   <!-- block_id=007 flavour=paragraph -->
 *   New inserted paragraph 2
 * ```
 *
 * The generated patches:
 * ```js
 *   [
 *     { op: 'insert', index: 3, after: '004', block: { id: '006', ... } },
 *     { op: 'insert', index: 4, after: '006', block: { id: '007', ... } },
 *     { op: 'update', id: '001', content: 'This is the 1st paragraph' },
 *     { op: 'delete', id: '003' },
 *     { op: 'delete', id: '005' }
 *   ]
 * ```
 *
 * UI expected:
 * ```
 * [UPDATE DIFF]This is the first paragraph
 * This is the second paragraph
 * [DELETE DIFF]This is the third paragraph
 * This is the fourth paragraph
 * [INSERT DIFF] New inserted paragraph 1
 * [INSERT DIFF] New inserted paragraph 2
 * [DELETE DIFF] This is the fifth paragraph
 * ```
 *
 * The resulting diffMap:
 * ```js
 *   {
 *     deletes: ['003', '005'],
 *     inserts: { '004': [block_006, block_007] },
 *     updates: { '001': 'This is the 1st paragraph' }
 *   }
 * ```
 */
export function generateRenderDiff(
  originalMarkdown: string,
  changedMarkdown: string
) {
  const { patches } = diffMarkdown(originalMarkdown, changedMarkdown);

  const diffMap: RenderDiffs = {
    deletes: [],
    inserts: {},
    updates: {},
  };

  const insertGroups: Record<string, Block[]> = {};
  let lastInsertKey: string | null = null;
  let lastInsertIndex: number | null = null;

  for (const patch of patches) {
    switch (patch.op) {
      case 'delete':
        diffMap.deletes.push(patch.id);
        break;
      case 'insert': {
        const prevBlockId = patch.after;
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
