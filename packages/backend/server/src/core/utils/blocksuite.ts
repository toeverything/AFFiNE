import { Array as YArray, Doc as YDoc, Map as YMap } from 'yjs';

import {
  parseYDocFromBinary,
  parseYDocToMarkdown,
  readAllDocIdsFromRootDoc,
} from '../../native';

export interface PageDocContent {
  title: string;
  summary: string;
}

export interface WorkspaceDocContent {
  name: string;
  avatarKey: string;
}

type KnownFlavour =
  | 'affine:page'
  | 'affine:note'
  | 'affine:surface'
  | 'affine:paragraph'
  | 'affine:list'
  | 'affine:code'
  | 'affine:image'
  | 'affine:attachment'
  | 'affine:transcription'
  | 'affine:callout'
  | 'affine:table';

export function parseWorkspaceDoc(doc: YDoc): WorkspaceDocContent | null {
  // not a workspace doc
  if (!doc.share.has('meta')) {
    return null;
  }

  const meta = doc.getMap('meta');

  return {
    name: meta.get('name') as string,
    avatarKey: meta.get('avatar') as string,
  };
}

export interface ParsePageOptions {
  maxSummaryLength: number;
}

export function parsePageDoc(
  doc: YDoc,
  opts: ParsePageOptions = { maxSummaryLength: 150 }
): PageDocContent | null {
  // not a page doc
  if (!doc.share.has('blocks')) {
    return null;
  }

  const blocks = doc.getMap<YMap<any>>('blocks');

  if (!blocks.size) {
    return null;
  }

  const content: PageDocContent = {
    title: '',
    summary: '',
  };

  let summaryLenNeeded = opts.maxSummaryLength;

  let root: YMap<any> | null = null;
  for (const block of blocks.values()) {
    const flavour = block.get('sys:flavour') as KnownFlavour;
    if (flavour === 'affine:page') {
      content.title = block.get('prop:title') as string;
      root = block;
    }
  }

  if (!root) {
    return null;
  }

  const queue: string[] = [root.get('sys:id')];

  function pushChildren(block: YMap<any>) {
    const children = block.get('sys:children') as YArray<string> | undefined;
    if (children?.length) {
      for (let i = children.length - 1; i >= 0; i--) {
        queue.push(children.get(i));
      }
    }
  }

  while (queue.length) {
    const blockId = queue.pop();
    const block = blockId ? blocks.get(blockId) : null;
    if (!block) {
      break;
    }

    const flavour = block.get('sys:flavour') as KnownFlavour;

    switch (flavour) {
      case 'affine:page':
      case 'affine:note': {
        pushChildren(block);
        break;
      }
      case 'affine:attachment':
      case 'affine:transcription':
      case 'affine:callout': {
        // only extract text in full content mode
        if (summaryLenNeeded === -1) {
          pushChildren(block);
        }
        break;
      }
      case 'affine:table': {
        // only extract text in full content mode
        if (summaryLenNeeded === -1) {
          const contents: string[] = [...block.keys()]
            .map(key => {
              if (key.startsWith('prop:cells.') && key.endsWith('.text')) {
                return block.get(key)?.toString() ?? '';
              }
              return '';
            })
            .filter(Boolean);
          content.summary += contents.join('|');
        }
        break;
      }
      case 'affine:paragraph':
      case 'affine:list':
      case 'affine:code': {
        pushChildren(block);
        const text = block.get('prop:text');
        if (!text) {
          continue;
        }

        if (summaryLenNeeded === -1) {
          content.summary += text.toString();
        } else if (summaryLenNeeded > 0) {
          content.summary += text.toString();
          summaryLenNeeded -= text.length;
        } else {
          break;
        }
      }
    }
  }

  return content;
}

export function readAllDocIdsFromWorkspaceSnapshot(snapshot: Uint8Array) {
  return readAllDocIdsFromRootDoc(Buffer.from(snapshot), false);
}

function safeParseJson<T>(str: string): T | undefined {
  try {
    return JSON.parse(str) as T;
  } catch {
    return undefined;
  }
}

export async function readAllBlocksFromDocSnapshot(
  docId: string,
  docSnapshot: Uint8Array
) {
  const result = parseYDocFromBinary(Buffer.from(docSnapshot), docId);

  return {
    ...result,
    blocks: result.blocks.map(block => ({
      ...block,
      docId,
      ref: block.refInfo,
      additional: block.additional
        ? safeParseJson(block.additional)
        : undefined,
    })),
  };
}

export function parseDocToMarkdownFromDocSnapshot(
  docId: string,
  docSnapshot: Uint8Array,
  aiEditable = false
) {
  const parsed = parseYDocToMarkdown(
    Buffer.from(docSnapshot),
    docId,
    aiEditable
  );

  return {
    title: parsed.title,
    markdown: parsed.markdown,
  };
}
