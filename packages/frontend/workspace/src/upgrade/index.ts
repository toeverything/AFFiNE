import { Unreachable } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Slot } from '@blocksuite/global/utils';
import {
  checkWorkspaceCompatibility,
  MigrationPoint,
} from '@toeverything/infra/blocksuite';
import {
  forceUpgradePages,
  upgradeV1ToV2,
} from '@toeverything/infra/blocksuite';
import { migrateGuidCompatibility } from '@toeverything/infra/blocksuite';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import type { WorkspaceManager } from '..';
import type { Workspace } from '../workspace';

export interface WorkspaceUpgradeStatus {
  needUpgrade: boolean;
  upgrading: boolean;
}

export class WorkspaceUpgradeController {
  _status: Readonly<WorkspaceUpgradeStatus> = {
    needUpgrade: false,
    upgrading: false,
  };
  readonly onStatusChange = new Slot<WorkspaceUpgradeStatus>();

  get status() {
    return this._status;
  }

  set status(value) {
    if (
      value.needUpgrade !== this._status.needUpgrade ||
      value.upgrading !== this._status.upgrading
    ) {
      this._status = value;
      this.onStatusChange.emit(value);
    }
  }

  constructor(private readonly workspace: Workspace) {
    workspace.blockSuiteWorkspace.doc.on('update', () => {
      this.checkIfNeedUpgrade();
    });
  }

  checkIfNeedUpgrade() {
    const needUpgrade = !!checkWorkspaceCompatibility(
      this.workspace.blockSuiteWorkspace,
      this.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD
    );
    this.status = {
      ...this.status,
      needUpgrade,
    };
    return needUpgrade;
  }

  async upgrade(workspaceManager: WorkspaceManager): Promise<string | null> {
    if (this.status.upgrading) {
      return null;
    }

    this.status = { ...this.status, upgrading: true };

    try {
      await this.workspace.engine.sync.waitForSynced();

      const step = checkWorkspaceCompatibility(
        this.workspace.blockSuiteWorkspace,
        this.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD
      );

      if (!step) {
        return null;
      }

      // Clone a new doc to prevent change events.
      const clonedDoc = new YDoc({
        guid: this.workspace.blockSuiteWorkspace.doc.guid,
      });
      applyDoc(clonedDoc, this.workspace.blockSuiteWorkspace.doc);

      if (step === MigrationPoint.SubDoc) {
        const newWorkspace = await workspaceManager.createWorkspace(
          WorkspaceFlavour.LOCAL,
          async (workspace, blobStorage) => {
            await upgradeV1ToV2(clonedDoc, workspace.doc);
            migrateGuidCompatibility(clonedDoc);
            await forceUpgradePages(
              workspace.doc,
              this.workspace.blockSuiteWorkspace.schema
            );
            const blobList =
              await this.workspace.blockSuiteWorkspace.blob.list();

            for (const blobKey of blobList) {
              const blob =
                await this.workspace.blockSuiteWorkspace.blob.get(blobKey);
              if (blob) {
                await blobStorage.set(blobKey, blob);
              }
            }
          }
        );
        await workspaceManager.deleteWorkspace(this.workspace.meta);
        return newWorkspace;
      } else if (step === MigrationPoint.GuidFix) {
        migrateGuidCompatibility(clonedDoc);
        await forceUpgradePages(
          clonedDoc,
          this.workspace.blockSuiteWorkspace.schema
        );
        applyDoc(this.workspace.blockSuiteWorkspace.doc, clonedDoc);
        await this.workspace.engine.sync.waitForSynced();
        return null;
      } else if (step === MigrationPoint.BlockVersion) {
        await forceUpgradePages(
          clonedDoc,
          this.workspace.blockSuiteWorkspace.schema
        );
        applyDoc(this.workspace.blockSuiteWorkspace.doc, clonedDoc);
        await this.workspace.engine.sync.waitForSynced();
        return null;
      } else {
        throw new Unreachable();
      }
    } finally {
      this.status = { ...this.status, upgrading: false };
    }
  }
}

function applyDoc(target: YDoc, result: YDoc) {
  applyUpdate(target, encodeStateAsUpdate(result));
  for (const targetSubDoc of target.subdocs.values()) {
    const resultSubDocs = Array.from(result.subdocs.values());
    const resultSubDoc = resultSubDocs.find(
      item => item.guid === targetSubDoc.guid
    );
    if (resultSubDoc) {
      applyDoc(targetSubDoc, resultSubDoc);
    }
  }
}
