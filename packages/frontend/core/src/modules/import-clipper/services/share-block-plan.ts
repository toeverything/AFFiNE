import type { EmbedCardStyle } from '@blocksuite/affine/model';

import type { ShareImportInput } from './share-import-types';

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

export function shareUrlTitle(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
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

export function createShareBlockPlan(
  input: ShareImportInput,
  embedOptions: ShareEmbedOptions | null = null
) {
  if (input.content.kind !== 'url' || !input.content.url) return [];

  const ids = shareImportBlockIds(input.importAttemptId);
  const primary: ShareBlockPlanNode = embedOptions
    ? {
        id: ids.bookmark,
        flavour: embedOptions.flavour,
        props: { url: input.content.url, style: embedOptions.styles[0] },
      }
    : {
        id: ids.bookmark,
        flavour: 'affine:bookmark',
        props: { url: input.content.url, style: 'horizontal' },
      };
  const selectedText = input.content.text?.trim();

  return [
    primary,
    ...(selectedText
      ? [
          {
            id: ids.selectedText,
            flavour: 'affine:paragraph',
            props: { type: 'quote', text: selectedText },
          },
        ]
      : []),
  ];
}
