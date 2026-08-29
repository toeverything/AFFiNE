import type { EmbedCardStyle } from '@blocksuite/affine/model';

import type { ShareImportInput } from './import';

export interface ShareBlockPlanNode {
  id: string;
  flavour: string;
  props: Record<string, unknown>;
  children?: ShareBlockPlanNode[];
}

export interface ShareEmbedOptions {
  flavour: string;
  styles: EmbedCardStyle[];
}

export function shareImportBlockIds(importAttemptId: string) {
  const prefix = `share-${importAttemptId}`;
  return {
    page: `${prefix}-page`,
    surface: `${prefix}-surface`,
    note: `${prefix}-note`,
    bookmark: `${prefix}-bookmark`,
    selectedText: `${prefix}-selected-text`,
    sourceLink: `${prefix}-source-link`,
    image: `${prefix}-image`,
    attachment: `${prefix}-attachment`,
  };
}

export function validatesStableBlock(
  existing:
    | { flavour: string; parentId?: string; props?: Record<string, unknown> }
    | undefined,
  expected: { flavour: string; parentId?: string }
) {
  return (
    !existing ||
    (existing.flavour === expected.flavour &&
      (expected.parentId === undefined ||
        existing.parentId === expected.parentId))
  );
}

export function reconcileShareTitles({
  rootTitle,
  pageTitle,
  importTitle,
}: {
  rootTitle: string;
  pageTitle: string;
  importTitle: string;
}) {
  const root = rootTitle.trim();
  const page = pageTitle.trim();
  if (root && page) return { rootTitle, pageTitle };
  const title = root || page || importTitle.trim();
  return {
    rootTitle: root ? rootTitle : title,
    pageTitle: page ? pageTitle : title,
  };
}

export function mergeShareDestinationMetadata({
  existingTagIds,
  requestedTagIds,
  existingCollectionIds,
  requestedCollectionId,
}: {
  existingTagIds: Iterable<string>;
  requestedTagIds: Iterable<string>;
  existingCollectionIds: Iterable<string>;
  requestedCollectionId?: string;
}) {
  const tagIds = new Set(existingTagIds);
  for (const id of requestedTagIds) tagIds.add(id);
  const collectionIds = new Set(existingCollectionIds);
  if (requestedCollectionId) collectionIds.add(requestedCollectionId);
  return { tagIds, collectionIds };
}

export function createShareBlockPlan(
  input: ShareImportInput,
  _embedOptions: ShareEmbedOptions | null
) {
  if (input.content.kind !== 'url' || !input.content.url) return [];

  const preview = input.preview;
  const title =
    preview?.title?.trim() ||
    input.title.trim() ||
    (() => {
      try {
        return new URL(input.content.url).hostname;
      } catch {
        return input.content.url;
      }
    })();
  const primary: ShareBlockPlanNode = {
    id: shareImportBlockIds(input.importAttemptId).bookmark,
    flavour: 'affine:bookmark',
    props: {
      url: input.content.url,
      title,
      description: preview?.description,
      icon: preview?.favicons?.[0],
      image: preview?.images?.[0],
      style: 'horizontal',
    },
  };
  const selectedText = input.content.text?.trim();

  return [
    primary,
    ...(selectedText
      ? [
          {
            id: shareImportBlockIds(input.importAttemptId).selectedText,
            flavour: 'affine:paragraph',
            props: { type: 'quote', text: selectedText },
          },
        ]
      : []),
  ];
}
