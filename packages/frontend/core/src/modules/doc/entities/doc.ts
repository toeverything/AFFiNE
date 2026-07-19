import type { DocMode, RootBlockModel } from '@blocksuite/affine/model';
import { Entity } from '@toeverything/infra';
import { throttle } from 'lodash-es';
import type { Transaction } from 'yjs';

import type { DocProperties } from '../../db';
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

    const handleTransactionThrottled = throttle(
      (trx: Transaction) => {
        if (trx.local) {
          this.setUpdatedAt(Date.now());
        }
      },
      1000,
      {
        leading: true,
        trailing: true,
      }
    );
    this.yDoc.on('afterTransaction', handleTransactionThrottled);

    this.disposables.push(() => {
      this.yDoc.off('afterTransaction', handleTransactionThrottled);
      handleTransactionThrottled.cancel();
    });

    this.disposables.push(
      this.workspaceService.workspace.engine.doc.addPriority(this.id, 100)
    );

    this.disposables.push(
      this.workspaceService.workspace.engine.indexer.addPriority(this.id, 100)
    );
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

  public readonly yDoc = this.scope.props.blockSuiteDoc.spaceDoc;
  public readonly blockSuiteDoc = this.scope.props.blockSuiteDoc;
  public readonly record = this.scope.props.record;

  readonly meta$ = this.record.meta$;
  readonly properties$ = this.record.properties$;
  readonly primaryMode$ = this.record.primaryMode$;
  readonly title$ = this.record.title$;
  readonly trash$ = this.record.trash$;
  readonly createdAt$ = this.record.createdAt$;
  readonly updatedAt$ = this.record.updatedAt$;
  readonly createdBy$ = this.record.createdBy$;
  readonly updatedBy$ = this.record.updatedBy$;

  setCreatedAt(createdAt: number) {
    this.record.setMeta({ createDate: createdAt });
  }

  setUpdatedAt(updatedAt: number) {
    this.record.setMeta({ updatedDate: updatedAt });
  }

  setCreatedBy(createdBy: string) {
    this.setProperty('createdBy', createdBy);
  }

  setUpdatedBy(updatedBy: string) {
    this.setProperty('updatedBy', updatedBy);
  }

  customProperty$(propertyId: string) {
    return this.record.customProperty$(propertyId);
  }

  setProperty(propertyId: string, value: string) {
    return this.record.setProperty(propertyId, value);
  }

  updateProperties(properties: Partial<DocProperties>) {
    return this.record.updateProperties(properties);
  }

  getProperties() {
    return this.record.getProperties();
  }

  setCustomProperty(propertyId: string, value: string) {
    return this.record.setCustomProperty(propertyId, value);
  }

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

  addPriorityLoad(priority: number) {
    return this.store.addPriorityLoad(this.id, priority);
  }

  changeDocTitle(newTitle: string) {
    const pageBlock = this.blockSuiteDoc.getBlocksByFlavour('affine:page').at(0)
      ?.model as RootBlockModel | undefined;
    if (pageBlock) {
      this.blockSuiteDoc.transact(() => {
        pageBlock.props.title.delete(0, pageBlock.props.title.length);
        pageBlock.props.title.insert(newTitle, 0);
      });
      this.record.setMeta({ title: newTitle });
    }
  }
}
