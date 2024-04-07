import { DocCollection } from '@blocksuite/store';
import { nanoid } from 'nanoid';
import type { Awareness } from 'y-protocols/awareness.js';

import { Entity } from '../../../framework';
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
        blobStorages: [
          () => ({
            crud: {
              get: key => {
                return this.engine.blob.get(key);
              },
              set: (key, value) => {
                return this.engine.blob.set(key, value);
              },
              list: () => {
                return this.engine.blob.list();
              },
              delete: key => {
                return this.engine.blob.delete(key);
              },
            },
          }),
        ],
        idGenerator: () => nanoid(),
        schema: globalBlockSuiteSchema,
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

  get flavourProvider() {
    return this.scope.props.flavourProvider;
  }
}
