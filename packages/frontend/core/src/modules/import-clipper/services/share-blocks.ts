import type { createBlockStdScope } from '@affine/core/blocksuite/manager/view';
import { Text } from '@blocksuite/affine/store';

import {
  createShareBlockPlan,
  reconcileShareTitles,
  type ShareBlockPlanNode,
  type ShareEmbedOptions,
  shareImportBlockIds,
  shareUrlTitle,
  validatesStableBlock,
} from './share-block-plan';
import type { ShareImportInput } from './share-import-types';

export function addShareBlocks(
  store: Parameters<typeof createBlockStdScope>[0],
  parentId: string,
  nodes: ShareBlockPlanNode[]
) {
  const parent = store.getBlock(parentId)?.model;
  const siblingIndex = (id: string) =>
    parent?.children.findIndex(child => child.id === id) ?? -1;
  const insertionIndex = (nodeIndex: number) => {
    for (let index = nodeIndex + 1; index < nodes.length; index++) {
      const existingIndex = siblingIndex(nodes[index].id);
      if (existingIndex >= 0) return existingIndex;
    }
    for (let index = nodeIndex - 1; index >= 0; index--) {
      const existingIndex = siblingIndex(nodes[index].id);
      if (existingIndex >= 0) return existingIndex + 1;
    }
    return undefined;
  };

  for (const [nodeIndex, node] of nodes.entries()) {
    const props = Object.fromEntries(
      Object.entries(node.props)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [
          key,
          key === 'text' ? new Text(value as string) : value,
        ])
    );
    const blockId = store.getBlock(node.id)
      ? node.id
      : store.addBlock(
          node.flavour,
          { id: node.id, ...props },
          parentId,
          insertionIndex(nodeIndex)
        );
    if (node.children) {
      addShareBlocks(store, blockId, node.children);
    }
  }
}

export function shareLeaves(
  input: ShareImportInput,
  embedOptions: ShareEmbedOptions | null = null
): ShareBlockPlanNode[] {
  if (input.content.kind === 'url') {
    return createShareBlockPlan(input, embedOptions);
  }
  const nodes: ShareBlockPlanNode[] = [];
  const selectedText = input.content.text?.trim();
  if (selectedText) {
    nodes.push({
      id: shareImportBlockIds(input.importAttemptId).selectedText,
      flavour: 'affine:paragraph',
      props: { type: 'quote', text: selectedText },
    });
  }
  if (input.content.url) {
    nodes.push({
      id: shareImportBlockIds(input.importAttemptId).sourceLink,
      flavour: 'affine:bookmark',
      props: {
        url: input.content.url,
        title: input.title.trim() || shareUrlTitle(input.content.url),
        style: 'horizontal',
      },
    });
  }
  return nodes;
}

export function hasValidSharePlan(
  store: Parameters<typeof createBlockStdScope>[0],
  ids: ReturnType<typeof shareImportBlockIds>,
  leaves: ShareBlockPlanNode[],
  contentKind: ShareImportInput['content']['kind']
): boolean {
  return (
    hasOnlyMatchingSkeleton(store, ids) &&
    ensureBlock(store, ids.page, 'affine:page') &&
    ensureBlock(store, ids.surface, 'affine:surface', ids.page) &&
    ensureBlock(store, ids.note, 'affine:note', ids.page) &&
    ensurePlan(store, leaves, ids.note) &&
    (contentKind !== 'image' ||
      ensureBlock(store, ids.image, 'affine:image', ids.note)) &&
    (contentKind !== 'pdf' ||
      ensureBlock(store, ids.attachment, 'affine:attachment', ids.note))
  );
}

function ensurePlan(
  store: Parameters<typeof createBlockStdScope>[0],
  nodes: ShareBlockPlanNode[],
  parentId: string
): boolean {
  return nodes.every(node => {
    if (!ensureBlock(store, node.id, node.flavour, parentId)) {
      return false;
    }
    return node.children ? ensurePlan(store, node.children, node.id) : true;
  });
}

function ensureBlock(
  store: Parameters<typeof createBlockStdScope>[0],
  id: string,
  flavour: string,
  parentId?: string
) {
  const existing = store.getBlock(id)?.model;
  return validatesStableBlock(
    existing && {
      flavour: existing.flavour,
      parentId: existing.parent?.id,
    },
    { flavour, parentId }
  );
}

function hasOnlyMatchingSkeleton(
  store: Parameters<typeof createBlockStdScope>[0],
  ids: ReturnType<typeof shareImportBlockIds>
) {
  return (
    hasOnlyBlock(store, 'affine:page', ids.page) &&
    hasOnlyBlock(store, 'affine:surface', ids.surface)
  );
}

function hasOnlyBlock(
  store: Parameters<typeof createBlockStdScope>[0],
  flavour: string,
  id: string
) {
  return store.getBlocksByFlavour(flavour).every(block => block.id === id);
}

export function reconcileShareTitle(
  record: {
    meta$: { value: { title?: string } };
    setMeta(meta: { title: string }): void;
  },
  page: { props: { title?: Text } } | undefined,
  importTitle: string
) {
  if (!page?.props.title) return;
  const rootTitle = record.meta$.value.title ?? '';
  const pageTitle = page.props.title.toString();
  const next = reconcileShareTitles({ rootTitle, pageTitle, importTitle });
  if (next.rootTitle !== rootTitle) record.setMeta({ title: next.rootTitle });
  if (next.pageTitle !== pageTitle) {
    page.props.title.delete(0, page.props.title.length);
    page.props.title.insert(next.pageTitle, 0);
  }
}
