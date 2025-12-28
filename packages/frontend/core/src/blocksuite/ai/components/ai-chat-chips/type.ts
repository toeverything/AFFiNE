import type { TagMeta } from '@affine/core/components/page-list';
import type { DocMeta, Store } from '@blocksuite/affine/store';
import type { Signal } from '@preact/signals-core';

export type ChipState = 'candidate' | 'processing' | 'finished' | 'failed';

export interface BaseChip {
  /**
   * candidate: the chip is a candidate for the chat
   * processing: the chip is processing
   * finished: the chip is successfully processed
   * failed: the chip is failed to process
   */
  state: ChipState;
  tooltip?: string | null;
  createdAt?: number | null;
}

export interface DocChip extends BaseChip {
  docId: string;
  markdown?: Signal<string> | null;
  tokenCount?: number | null;
}

export interface FileChip extends BaseChip {
  file: File;
  fileId?: string | null;
  blobId?: string | null;
}

export interface TagChip extends BaseChip {
  tagId: string;
}

export interface CollectionChip extends BaseChip {
  collectionId: string;
}

export interface AttachmentChip extends BaseChip {
  sourceId: string;
  name: string;
}

export interface SelectedContextChip extends BaseChip {
  uuid: string;
  snapshot: string | null;
  combinedElementsMarkdown: string | null;
  html: string | null;
}

export type ChatChip =
  | DocChip
  | FileChip
  | TagChip
  | CollectionChip
  | AttachmentChip
  | SelectedContextChip;

export interface DocDisplayConfig {
  getIcon: (docId: string) => any;
  getTitle: (docId: string) => string;
  getTitleSignal: (docId: string) => {
    signal: Signal<string>;
    cleanup: () => void;
  };
  getDocMeta: (docId: string) => Partial<DocMeta> | null;
  getDocPrimaryMode: (docId: string) => 'page' | 'edgeless';
  getDoc: (docId: string) => Store | null;
  getReferenceDocs: (docIds: string[]) => {
    signal: Signal<
      Array<{
        docId: string;
        title: string;
      }>
    >;
    cleanup: () => void;
  };
  getTags: () => {
    signal: Signal<TagMeta[]>;
    cleanup: () => void;
  };
  getTagTitle: (tagId: string) => string;
  getTagPageIds: (tagId: string) => string[];
  getCollections: () => {
    signal: Signal<{ id: string; name: string }[]>;
    cleanup: () => void;
  };
  getCollectionPageIds: (collectionId: string) => string[];
}
