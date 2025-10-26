import { type CellDataType } from '@blocksuite/affine/model';
import { type Doc as YDoc, type Map as YMap } from 'yjs';

export interface WorkspacePage {
  id: string;
  guid: string;
  title: string;
  createDate: number;
  trash?: boolean;
  favorite?: boolean;
  properties?: Record<string, any>;
}

export type BaseFlavour<T extends string> = `affine:${T}`;

export type Flavour = BaseFlavour<
  | 'page'
  | 'frame'
  | 'paragraph'
  | 'code'
  | 'note'
  | 'list'
  | 'divider'
  | 'embed'
  | 'image'
  | 'surface'
  | 'database'
  | 'table'
  | 'attachment'
  | 'bookmark'
  | 'embed-youtube'
  | 'embed-linked-doc'
  | 'embed-synced-doc'
>;

export interface BaseParsedBlock {
  id: string;
  flavour: Flavour;
  content: string;
  children: BaseParsedBlock[];
  type?: string;
}

export interface ParsedDoc {
  title: string;
  md: string;
  parsedBlock?: ParsedBlock;
}

export interface ParagraphBlock extends BaseParsedBlock {
  flavour: 'affine:paragraph';
  type: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote';
}

export interface DividerBlock extends BaseParsedBlock {
  flavour: 'affine:divider';
}

export interface ListBlock extends BaseParsedBlock {
  flavour: 'affine:list';
  type: 'bulleted' | 'numbered';
}

export interface CodeBlock extends BaseParsedBlock {
  flavour: 'affine:code';
  language: string;
}

export interface ImageBlock extends BaseParsedBlock {
  flavour: 'affine:image';
  sourceId: string;
  blobUrl: string;
  width?: number;
  height?: number;
  caption?: string;
}

export interface AttachmentBlock extends BaseParsedBlock {
  flavour: 'affine:attachment';
  type: string;
  sourceId: string;
}

export interface EmbedYoutubeBlock extends BaseParsedBlock {
  flavour: 'affine:embed-youtube';
  videoId: string;
}

export interface BookmarkBlock extends BaseParsedBlock {
  flavour: 'affine:bookmark';
  url: string;
}

export interface EmbedLinkedDocBlock extends BaseParsedBlock {
  flavour: 'affine:embed-linked-doc';
  pageId: string;
}

export interface EmbedSyncedDocBlock extends BaseParsedBlock {
  flavour: 'affine:embed-synced-doc';
  pageId: string;
}

export interface DatabaseBlock extends BaseParsedBlock {
  title: string;
  flavour: 'affine:database';
  rows: Record<string, string>[];
}

export interface TableBlock extends BaseParsedBlock {
  flavour: 'affine:table';
  rows: string[][];
  columns: string[];
}

export type ParsedBlock =
  | ParagraphBlock
  | DividerBlock
  | ListBlock
  | CodeBlock
  | ImageBlock
  | AttachmentBlock
  | EmbedYoutubeBlock
  | BookmarkBlock
  | DatabaseBlock
  | TableBlock
  | BaseParsedBlock;

export interface ParsedDoc {
  title: string;
  md: string;
  parsedBlock?: ParsedBlock;
}

export type SerializedCells = {
  // row
  [key: string]: {
    // column
    [key: string]: CellDataType;
  };
};

export type YBlock = YMap<unknown>;
export type YBlocks = YMap<YBlock>;

export interface ParserContext {
  workspaceId: string;
  doc: YDoc;
  buildBlobUrl: (blobId: string) => string;
  buildDocUrl: (docId: string) => string;
  renderDocTitle?: (docId: string) => string;
  aiEditable?: boolean;
}
