import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { Workspace as WorkspaceInterface } from '@blocksuite/affine/store';
import { Entity, LiveData, yjsGetPath } from '@toeverything/infra';
import type { Observable } from 'rxjs';
import { Doc as YDoc, transact } from 'yjs';

import { DocsService } from '../../doc';
import { WorkspaceImpl } from '../impls/workspace';
import type { WorkspaceScope } from '../scopes/workspace';
import { WorkspaceEngineService } from '../services/engine';

export class Workspace extends Entity {
  constructor(
    public readonly scope: WorkspaceScope,
    public readonly featureFlagService: FeatureFlagService
  ) {
    super();
  }

  readonly id = this.scope.props.openOptions.metadata.id;

  readonly openOptions = this.scope.props.openOptions;

  readonly meta = this.scope.props.openOptions.metadata;

  readonly flavour = this.meta.flavour;

  readonly rootYDoc = new YDoc({ guid: this.openOptions.metadata.id });

  _docCollection: WorkspaceInterface | null = null;

  get docCollection() {
    if (!this._docCollection) {
      this._docCollection = new WorkspaceImpl({
        id: this.openOptions.metadata.id,
        rootDoc: this.rootYDoc,
        featureFlagService: this.featureFlagService,
        blobSource: {
          get: async key => {
            const record = await this.engine.blob.get(key);
            return record
              ? new Blob([record.data], { type: record.mime })
              : null;
          },
          delete: async () => {
            return;
          },
          list: async () => {
            return [];
          },
          set: async (id, blob) => {
            await this.engine.blob.set({
              key: id,
              data: new Uint8Array(await blob.arrayBuffer()),
              mime: blob.type,
            });
            return id;
          },
          /* eslint-disable rxjs/finnish */
          blobState$: key => this.engine.blob.blobState$(key),
          upload: key => this.engine.blob.upload(key),
          name: 'blob',
          readonly: false,
        },
        onLoadDoc: doc => this.engine.doc.connectDoc(doc),
        onLoadAwareness: awareness =>
          this.engine.awareness.connectAwareness(awareness),
        onCreateDoc: docId =>
          this.docs.createDoc({ id: docId, skipInit: true }).id,
      });
    }
    return this._docCollection;
  }

  get docs() {
    return this.scope.get(DocsService);
  }

  get canGracefulStop() {
    // TODO
    return true;
  }

  get engine() {
    return this.framework.get(WorkspaceEngineService).engine;
  }

  name$ = LiveData.from<string | undefined>(
    yjsGetPath(this.rootYDoc.getMap('meta'), 'name') as Observable<
      string | undefined
    >,
    undefined
  );

  avatar$ = LiveData.from(
    yjsGetPath(this.rootYDoc.getMap('meta'), 'avatar') as Observable<
      string | undefined
    >,
    undefined
  );

  setAvatar(avatar: string) {
    transact(
      this.rootYDoc,
      () => {
        this.rootYDoc.getMap('meta').set('avatar', avatar);
      },
      { force: true }
    );
  }

  setName(name: string) {
    transact(
      this.rootYDoc,
      () => {
        this.rootYDoc.getMap('meta').set('name', name);
      },
      { force: true }
    );
  }

  override dispose(): void {
    this.docCollection.dispose();
  }
}
