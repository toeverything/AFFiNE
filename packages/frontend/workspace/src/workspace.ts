import { DebugLogger } from '@affine/debug';
import { Slot } from '@blocksuite/global/utils';
import type { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';

import type { WorkspaceEngine, WorkspaceEngineStatus } from './engine';
import type { WorkspaceMetadata } from './metadata';
import {
  WorkspaceUpgradeController,
  type WorkspaceUpgradeStatus,
} from './upgrade';

const logger = new DebugLogger('affine:workspace');

export type WorkspaceStatus = {
  mode: 'ready' | 'closed';
  engine: WorkspaceEngineStatus;
  upgrade: WorkspaceUpgradeStatus;
};

/**
 * # Workspace
 *
 * ```
 *               ┌───────────┐
 *               │ Workspace │
 *               └─────┬─────┘
 *                     │
 *                     │
 *      ┌──────────────┼─────────────┐
 *      │              │             │
 *  ┌───┴─────┐ ┌──────┴─────┐   ┌───┴────┐
 *  │ Upgrade │ │ blocksuite │   │ Engine │
 *  └─────────┘ └────────────┘   └───┬────┘
 *                                   │
 *                            ┌──────┼─────────┐
 *                            │      │         │
 *                         ┌──┴─┐ ┌──┴─┐ ┌─────┴───┐
 *                         │sync│ │blob│ │awareness│
 *                         └────┘ └────┘ └─────────┘
 * ```
 *
 * This class contains all the components needed to run a workspace.
 */
export class Workspace {
  get id() {
    return this.meta.id;
  }
  get flavour() {
    return this.meta.flavour;
  }

  private _status: WorkspaceStatus;

  upgrade: WorkspaceUpgradeController;

  /**
   * event on workspace stop, workspace is one-time use, so it will be triggered only once
   */
  onStop = new Slot();

  onStatusChange = new Slot<WorkspaceStatus>();
  get status() {
    return this._status;
  }

  set status(status: WorkspaceStatus) {
    this._status = status;
    this.onStatusChange.emit(status);
  }

  constructor(
    public meta: WorkspaceMetadata,
    public engine: WorkspaceEngine,
    public blockSuiteWorkspace: BlockSuiteWorkspace
  ) {
    this.upgrade = new WorkspaceUpgradeController(this);

    this._status = {
      mode: 'closed',
      engine: engine.status,
      upgrade: this.upgrade.status,
    };
    this.engine.onStatusChange.on(status => {
      this.status = {
        ...this.status,
        engine: status,
      };
    });
    this.upgrade.onStatusChange.on(status => {
      this.status = {
        ...this.status,
        upgrade: status,
      };
    });

    this.start();
  }

  /**
   * workspace start when create and workspace is one-time use
   */
  private start() {
    if (this.status.mode === 'ready') {
      return;
    }
    logger.info('start workspace', this.id);
    this.engine.start();
    this.status = {
      ...this.status,
      mode: 'ready',
      engine: this.engine.status,
    };
  }

  canGracefulStop() {
    return this.engine.canGracefulStop() && !this.status.upgrade.upgrading;
  }

  forceStop() {
    if (this.status.mode === 'closed') {
      return;
    }
    logger.info('stop workspace', this.id);
    this.engine.forceStop();
    this.status = {
      ...this.status,
      mode: 'closed',
      engine: this.engine.status,
    };
    this.onStop.emit();
  }

  // same as `WorkspaceEngine.sync.setPriorityRule`
  setPriorityRule(target: ((id: string) => boolean) | null) {
    this.engine.sync.setPriorityRule(target);
  }
}
