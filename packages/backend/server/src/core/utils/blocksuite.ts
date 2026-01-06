import {
  parsePageDocFromBinary,
  parseWorkspaceDocFromBinary,
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

export interface ParsePageOptions {
  maxSummaryLength?: number;
}

export function parseWorkspaceDoc(
  snapshot: Uint8Array
): WorkspaceDocContent | null {
  return parseWorkspaceDocFromBinary(Buffer.from(snapshot)) ?? null;
}

export function parsePageDoc(
  docSnapshot: Uint8Array,
  opts: ParsePageOptions = { maxSummaryLength: 150 }
): PageDocContent | null {
  return (
    parsePageDocFromBinary(
      Buffer.from(docSnapshot),
      opts?.maxSummaryLength ?? 150
    ) ?? null
  );
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
  workspaceId: string,
  docId: string,
  docSnapshot: Uint8Array,
  aiEditable = false
) {
  const docUrlPrefix = workspaceId ? `/workspace/${workspaceId}` : undefined;
  const parsed = parseYDocToMarkdown(
    Buffer.from(docSnapshot),
    docId,
    aiEditable,
    docUrlPrefix
  );

  return {
    title: parsed.title,
    markdown: parsed.markdown,
  };
}
