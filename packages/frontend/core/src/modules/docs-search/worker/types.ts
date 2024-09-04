import type { Document } from '@toeverything/infra';

import type { BlockIndexSchema, DocIndexSchema } from '../schema';

export type WorkerIngoingMessage = (
  | {
      type: 'init';
    }
  | {
      type: 'run';
      input: WorkerInput;
    }
) & { msgId: number };

export type WorkerOutgoingMessage = (
  | {
      type: 'init';
    }
  | {
      type: 'done';
      output: WorkerOutput;
    }
  | {
      type: 'failed';
      error: string;
    }
) & { msgId: number };

export type WorkerInput =
  | {
      type: 'rootDoc';
      rootDocBuffer: Uint8Array;
      allIndexedDocs: string[];
      reindexAll?: boolean;
    }
  | {
      type: 'doc';
      storageDocId: string;
      rootDocBuffer: Uint8Array;
      docBuffer: Uint8Array;
    };

export interface WorkerOutput {
  reindexDoc?: { docId: string; storageDocId: string }[];
  addedDoc?: {
    id: string;
    blocks: Document<BlockIndexSchema>[];
    doc: Document<DocIndexSchema>;
  }[];
  deletedDoc?: string[];
}
