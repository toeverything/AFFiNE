import type { DocMode, RootBlockModel } from '@blocksuite/affine/blocks';

import { Entity } from '../../../framework';
import type { WorkspaceService } from '../../workspace';
import type { DocScope } from '../scopes/doc';
import type { DocsStore } from '../stores/docs';

export class Doc extends Entity {
  constructor(
    public readonly scope: DocScope,
    private readonly store: DocsStore,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  /**
   * for convenience
   */
  get workspace() {
    return this.workspaceService.workspace;
  }

  get id() {
    return this.scope.props.docId;
  }

  public readonly blockSuiteDoc = this.scope.props.blockSuiteDoc;
  public readonly record = this.scope.props.record;

  readonly meta$ = this.record.meta$;
  readonly properties$ = this.record.properties$;
  readonly primaryMode$ = this.record.primaryMode$;
  readonly title$ = this.record.title$;
  readonly trash$ = this.record.trash$;

  setPrimaryMode(mode: DocMode) {
    return this.record.setPrimaryMode(mode);
  }

  getPrimaryMode() {
    return this.record.getPrimaryMode();
  }

  togglePrimaryMode() {
    this.setPrimaryMode(
      (this.getPrimaryMode() === 'edgeless' ? 'page' : 'edgeless') as DocMode
    );
  }

  moveToTrash() {
    return this.record.moveToTrash();
  }

  restoreFromTrash() {
    return this.record.restoreFromTrash();
  }

  waitForSyncReady() {
    return this.store.waitForDocLoadReady(this.id);
  }

  setPriorityLoad(priority: number) {
    return this.store.setPriorityLoad(this.id, priority);
  }

  changeDocTitle(newTitle: string) {
    const pageBlock = this.blockSuiteDoc.getBlocksByFlavour('affine:page').at(0)
      ?.model as RootBlockModel | undefined;
    if (pageBlock) {
      this.blockSuiteDoc.transact(() => {
        pageBlock.title.delete(0, pageBlock.title.length);
        pageBlock.title.insert(newTitle, 0);
      });
      this.record.setMeta({ title: newTitle });
    }
  }
}
