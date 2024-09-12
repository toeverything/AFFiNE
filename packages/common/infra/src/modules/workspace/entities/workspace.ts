import { DocCollection } from '@blocksuite/store';
import { nanoid } from 'nanoid';
import { Observable } from 'rxjs';
import type { Awareness } from 'y-protocols/awareness.js';

import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import { globalBlockSuiteSchema } from '../global-schema';
import type { WorkspaceScope } from '../scopes/workspace';
import { WorkspaceEngineService } from '../services/engine';
import { WorkspaceUpgradeService } from '../services/upgrade';

export class Workspace extends Entity {
  constructor(public readonly scope: WorkspaceScope) {
    super();
  }

  readonly id = this.scope.props.openOptions.metadata.id;

  readonly openOptions = this.scope.props.openOptions;

  readonly meta = this.scope.props.openOptions.metadata;

  readonly flavour = this.meta.flavour;

  _docCollection: DocCollection | null = null;

  get docCollection() {
    if (!this._docCollection) {
      this._docCollection = new DocCollection({
        id: this.openOptions.metadata.id,
        blobSources: {
          main: this.engine.blob,
        },
        idGenerator: () => nanoid(),
        schema: globalBlockSuiteSchema,
      });
      this._docCollection.slots.docCreated.on(id => {
        this.engine.doc.markAsReady(id);
      });
    }
    return this._docCollection;
  }

  get awareness() {
    return this.docCollection.awarenessStore.awareness as Awareness;
  }

  get rootYDoc() {
    return this.docCollection.doc;
  }

  get canGracefulStop() {
    // TODO
    return true;
  }

  get engine() {
    return this.framework.get(WorkspaceEngineService).engine;
  }

  get upgrade() {
    return this.framework.get(WorkspaceUpgradeService).upgrade;
  }

  name$ = LiveData.from<string | undefined>(
    new Observable(subscriber => {
      subscriber.next(this.docCollection.meta.name);
      return this.docCollection.meta.commonFieldsUpdated.on(() => {
        subscriber.next(this.docCollection.meta.name);
      }).dispose;
    }),
    undefined
  );

  avatar$ = LiveData.from<string | undefined>(
    new Observable(subscriber => {
      subscriber.next(this.docCollection.meta.avatar);
      return this.docCollection.meta.commonFieldsUpdated.on(() => {
        subscriber.next(this.docCollection.meta.avatar);
      }).dispose;
    }),
    undefined
  );
}
