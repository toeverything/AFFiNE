import isMatch from 'lodash.ismatch';

import type { Block, BlockModel, BlockViewType } from '../block/index.js';

export type QueryMatch = {
  id?: string;
  flavour?: string;
  props?: Record<string, unknown>;
  /**
   * Matches any block whose ancestor chain includes the block with this
   * id — i.e. "this block, and everything under it, forever," rather
   * than a fixed snapshot of ids collected once. Unlike `id`/`flavour`/
   * `props` (all evaluated against the block itself), this walks
   * `store.getParent(...)` up from the block being matched.
   *
   * Exists specifically so a consumer that wants "a stable subtree" (a
   * cross-doc reference rendering a whole note, for example) can express
   * that once, at query-construction time, instead of having to
   * re-enumerate every descendant id and rebuild the entire `Query`
   * (and therefore the `Store` — see `getStore`'s own cache-by-query-
   * identity behavior) every single time a new block is added anywhere
   * inside that subtree. `runQuery` already re-evaluates on every block
   * add (`Store._onBlockAdded`), so a newly-created descendant is
   * classified correctly the *first* time it's ever seen — no
   * incremental query update, no new `Store`, no full re-render of
   * already-mounted content required at all.
   */
  ancestor?: string;
  viewType: BlockViewType;
};

/**
 * - `strict` means that only blocks that match the query will be included.
 * - `loose` means that all blocks will be included first, and then the blocks will be run through the query.
 * - `include` means that only blocks and their ancestors that match the query will be included.
 */
type QueryMode = 'strict' | 'loose' | 'include';

export type Query = {
  match: QueryMatch[];
  mode: QueryMode;
};

export function runQuery(query: Query, block: Block) {
  const blockViewType = getBlockViewType(query, block);
  block.blockViewType = blockViewType;

  if (blockViewType !== 'hidden') {
    const queryMode = query.mode;
    setAncestorsToDisplayIfHidden(queryMode, block);
  }
}

function getBlockViewType(query: Query, block: Block): BlockViewType {
  const flavour = block.model.flavour;
  const id = block.model.id;
  const queryMode = query.mode;
  const props = block.model.keys.reduce(
    (acc, key) => {
      return {
        ...acc,
        [key]: block.model.props[key as keyof BlockModel['props']],
      };
    },
    {} as Record<string, unknown>
  );
  let blockViewType: BlockViewType =
    queryMode === 'loose' ? 'display' : 'hidden';

  query.match.some(queryObject => {
    const {
      id: queryId,
      flavour: queryFlavour,
      props: queryProps,
      ancestor: queryAncestor,
      viewType,
    } = queryObject;
    const matchQueryId = queryId == null ? true : queryId === id;
    const matchQueryFlavour =
      queryFlavour == null ? true : queryFlavour === flavour;
    const matchQueryProps =
      queryProps == null ? true : isMatch(props, queryProps);
    const matchQueryAncestor =
      queryAncestor == null ? true : hasAncestor(block, queryAncestor);
    if (
      matchQueryId &&
      matchQueryFlavour &&
      matchQueryProps &&
      matchQueryAncestor
    ) {
      blockViewType = viewType;
      return true;
    }
    return false;
  });

  return blockViewType;
}

function hasAncestor(block: Block, ancestorId: string): boolean {
  const doc = block.model.store;
  let parent = doc.getParent(block.model);
  while (parent) {
    if (parent.id === ancestorId) return true;
    parent = doc.getParent(parent);
  }
  return false;
}

function setAncestorsToDisplayIfHidden(mode: QueryMode, block: Block) {
  const doc = block.model.store;
  let parent = doc.getParent(block.model);
  while (parent) {
    const parentBlock = doc.getBlock(parent.id);
    if (parentBlock && parentBlock.blockViewType === 'hidden') {
      parentBlock.blockViewType = mode === 'include' ? 'display' : 'bypass';
    }
    parent = doc.getParent(parent);
  }
}
