import { parsePageDoc } from '@affine/reader';
import { LifeCycleWatcher } from '@blocksuite/affine/std';
import { Extension, type Store } from '@blocksuite/affine/store';
import { type Container, createIdentifier } from '@blocksuite/global/di';
import { LiveData } from '@toeverything/infra';
import type { Subscription } from 'rxjs';

import { applyPatchToDoc } from '../utils/apply-model/apply-patch-to-doc';
import {
  generateRenderDiff,
  type RenderDiffs,
} from '../utils/apply-model/generate-render-diff';

interface RejectMap {
  deletes: string[];
  inserts: string[];
  updates: string[];
}

type AcceptDelete = {
  type: 'delete';
  payload: {
    id: string;
  };
};

type AcceptUpdate = {
  type: 'update';
  payload: {
    id: string;
    content: string;
  };
};

type AcceptInsert = {
  type: 'insert';
  payload: {
    from: string;
    offset: number;
    content: string;
  };
};

type Accept = AcceptDelete | AcceptUpdate | AcceptInsert;

type RejectDelete = {
  type: 'delete';
  payload: {
    id: string;
  };
};

type RejectUpdate = {
  type: 'update';
  payload: {
    id: string;
  };
};

type RejectInsert = {
  type: 'insert';
  payload: {
    from: string;
    offset: number;
  };
};

type Reject = RejectDelete | RejectUpdate | RejectInsert;

export interface BlockDiffProvider {
  diffMap$: LiveData<RenderDiffs>;
  rejects$: LiveData<RejectMap>;
  isBatchingApply: boolean;

  /**
   * Set the original markdown
   * @param originalMarkdown - The original markdown
   */
  setOriginalMarkdown(originalMarkdown: string | null): void;

  /**
   * Set the changed markdown
   * @param changedMarkdown - The changed markdown
   */
  setChangedMarkdown(changedMarkdown: string | null): void;

  /**
   * Apply the diff to the doc
   * @param doc - The doc
   * @param changedMarkdown - The changed markdown
   */
  apply(doc: Store, changedMarkdown: string): Promise<void>;

  /**
   * Clear the diff map
   */
  clearDiff(): void;

  /**
   * Get the diff map
   */
  getDiff(): RenderDiffs;

  /**
   * Check if there is any diff
   */
  hasDiff(): boolean;

  /**
   * Accept all the diffs
   */
  acceptAll(doc: Store): Promise<void>;

  /**
   * Accept a diff
   */
  accept(accept: Accept, doc: Store): Promise<void>;

  /**
   * Reject all the diffs
   */
  rejectAll(): void;

  /**
   * Reject a diff
   */
  reject(reject: Reject): void;

  /**
   * Check if a diff is rejected
   */
  isRejected(type: 'delete' | 'update' | 'insert', index: string): boolean;

  /**
   * Get the total number of diffs
   */
  getTotalDiffs(): number;

  /**
   * Get the markdown from the doc
   * @param doc - The doc
   */
  getMarkdownFromDoc(doc: Store): Promise<string>;

  /**
   * Get the index of a block in the doc
   * @param doc - The doc
   * @param blockId - The id of the block
   */
  getBlockIndexById(doc: Store, blockId: string): number;
}

export const BlockDiffProvider = createIdentifier<BlockDiffProvider>(
  'AffineBlockDiffService'
);

export class BlockDiffService extends Extension implements BlockDiffProvider {
  rejects$ = new LiveData<RejectMap>({
    deletes: [],
    inserts: [],
    updates: [],
  });

  diffMap$ = new LiveData<RenderDiffs>({
    deletes: [],
    inserts: {},
    updates: {},
  });

  private originalMarkdown: string | null = null;
  private changedMarkdown: string | null = null;

  isBatchingApply = false;

  static override setup(di: Container) {
    di.addImpl(BlockDiffProvider, BlockDiffService);
  }

  getBlockIndexById(doc: Store, blockId: string): number {
    const notes = doc.getBlocksByFlavour('affine:note');
    if (notes.length === 0) return 0;
    const note = notes[0].model;
    return note.children.findIndex(child => child.id === blockId);
  }

  hasDiff(): boolean {
    const { deletes, updates, inserts } = this.diffMap$.value;
    if (
      deletes.length > 0 ||
      Object.keys(updates).length > 0 ||
      Object.keys(inserts).length > 0
    ) {
      return true;
    }
    return false;
  }

  setOriginalMarkdown(originalMarkdown: string) {
    this.originalMarkdown = originalMarkdown;
    this._refreshDiff();
  }

  setChangedMarkdown(changedMarkdown: string) {
    this.changedMarkdown = changedMarkdown;
    this.clearRejects();
    this._refreshDiff();
  }

  async apply(doc: Store, changedMarkdown: string) {
    this.originalMarkdown = await this.getMarkdownFromDoc(doc);
    this.changedMarkdown = changedMarkdown;
    this.clearRejects();
    this._refreshDiff();
  }

  private _refreshDiff(): void {
    if (!this.originalMarkdown || !this.changedMarkdown) {
      this.clearDiff();
      return;
    }
    const diffMap = generateRenderDiff(
      this.originalMarkdown,
      this.changedMarkdown
    );
    this.diffMap$.next(diffMap);
  }

  getDiff(): RenderDiffs {
    return this.diffMap$.value;
  }

  clearDiff(): void {
    this.diffMap$.next({
      deletes: [],
      inserts: {},
      updates: {},
    });
  }

  clearRejects(): void {
    this.rejects$.next({
      deletes: [],
      inserts: [],
      updates: [],
    });
  }

  async acceptAll(doc: Store): Promise<void> {
    this.isBatchingApply = true;
    const { deletes, updates, inserts } = this.diffMap$.value;

    try {
      for (const [id, content] of Object.entries(updates)) {
        await applyPatchToDoc(doc, [{ op: 'replace', id, content }]);
      }
      for (const [from, blocks] of Object.entries(inserts)) {
        let baseIndex = 0;
        if (from !== 'HEAD') {
          baseIndex = this.getBlockIndexById(doc, from) + 1;
        }
        for (const [offset, block] of blocks.entries()) {
          await applyPatchToDoc(doc, [
            { op: 'insert', index: baseIndex + offset, after: from, block },
          ]);
        }
      }
      for (const id of deletes) {
        await applyPatchToDoc(doc, [{ op: 'delete', id }]);
      }
      this.diffMap$.next({
        deletes: [],
        inserts: {},
        updates: {},
      });
    } finally {
      this.isBatchingApply = false;
    }
  }

  async accept(accept: Accept, doc: Store) {
    const { type, payload } = accept;
    switch (type) {
      case 'delete': {
        await applyPatchToDoc(doc, [{ op: 'delete', id: payload.id }]);
        break;
      }
      case 'update': {
        await applyPatchToDoc(doc, [
          { op: 'replace', id: payload.id, content: payload.content },
        ]);
        break;
      }
      case 'insert': {
        const block = this.diffMap$.value.inserts[payload.from][payload.offset];
        let baseIndex = 0;
        if (payload.from !== 'HEAD') {
          baseIndex = this.getBlockIndexById(doc, payload.from) + 1;
        }
        await applyPatchToDoc(doc, [
          {
            op: 'insert',
            index: baseIndex + payload.offset,
            after: payload.from,
            block,
          },
        ]);
        break;
      }
    }
  }

  rejectAll(): void {
    this.clearDiff();
    this.clearRejects();
    this.changedMarkdown = null;
  }

  reject(reject: Reject): void {
    const rejects = this.rejects$.value;
    switch (reject.type) {
      case 'delete':
        this.rejects$.next({
          ...rejects,
          deletes: [...rejects.deletes, reject.payload.id],
        });
        break;
      case 'update':
        this.rejects$.next({
          ...rejects,
          updates: [...rejects.updates, reject.payload.id],
        });
        break;
      case 'insert':
        this.rejects$.next({
          ...rejects,
          inserts: [
            ...rejects.inserts,
            `${reject.payload.from}:${reject.payload.offset}`,
          ],
        });
        break;
    }
  }

  isRejected(type: 'delete' | 'update' | 'insert', index: string): boolean {
    const rejects = this.rejects$.value;
    if (type === 'delete') {
      return rejects.deletes.includes(index);
    }
    if (type === 'update') {
      return rejects.updates.includes(index);
    }
    if (type === 'insert') {
      return rejects.inserts.includes(index);
    }
    return false;
  }

  getTotalDiffs(): number {
    const rejects = this.rejects$.value;
    const { deletes, updates, inserts } = this.diffMap$.value;
    const insertCount = Object.values(inserts).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    const rejectDeleteCount = rejects.deletes.length;
    const rejectUpdateCount = rejects.updates.length;
    const rejectInsertCount = rejects.inserts.length;
    return (
      deletes.length +
      Object.keys(updates).length +
      insertCount -
      rejectDeleteCount -
      rejectUpdateCount -
      rejectInsertCount
    );
  }

  getMarkdownFromDoc = async (doc: Store) => {
    const job = doc.getTransformer();
    const snapshot = job.docToSnapshot(doc);
    const spaceDoc = doc.doc.spaceDoc;
    if (!snapshot) {
      throw new Error('Failed to get snapshot');
    }
    const parsed = parsePageDoc({
      doc: spaceDoc,
      workspaceId: doc.workspace.id,
      buildBlobUrl: (blobId: string) => {
        return `/${doc.workspace.id}/blobs/${blobId}`;
      },
      buildDocUrl: (docId: string) => {
        return `/workspace/${doc.workspace.id}/${docId}`;
      },
      aiEditable: true,
    });

    return parsed.md;
  };
}

export class BlockDiffWatcher extends LifeCycleWatcher {
  static override key = 'block-diff-watcher';

  private _blockUpdatedSubscription: Subscription | null = null;

  override created() {
    super.created();
  }

  private readonly _refreshOriginalMarkdown = async () => {
    const diffService = this.std.get(BlockDiffProvider);
    if (!diffService.hasDiff() || diffService.isBatchingApply) {
      return;
    }
    const markdown = await diffService.getMarkdownFromDoc(this.std.store);
    if (markdown) {
      diffService.setOriginalMarkdown(markdown);
    }
  };

  override mounted() {
    super.mounted();
    this._blockUpdatedSubscription =
      this.std.store.slots.blockUpdated.subscribe(() => {
        this._refreshOriginalMarkdown().catch(err => {
          console.error('Failed to refresh original markdown', err);
        });
      });
  }

  override unmounted() {
    super.unmounted();
    this._blockUpdatedSubscription?.unsubscribe();
  }
}
