import { DebugLogger } from '@affine/debug';
import type { WorkerInitOptions } from '@affine/nbstore/worker/client';
import { ObjectPool, Service } from '@toeverything/infra';

import type { Workspace } from '../entities/workspace';
import { WorkspaceInitialized } from '../events';
import type { WorkspaceOpenOptions } from '../open-options';
import { WorkspaceScope } from '../scopes/workspace';
import type { WorkspaceFlavoursService } from './flavours';
import type { WorkspaceListService } from './list';
import type { WorkspaceProfileService } from './profile';
import { WorkspaceService } from './workspace';

const logger = new DebugLogger('affine:workspace-repository');

export class WorkspaceRepositoryService extends Service {
  constructor(
    private readonly flavoursService: WorkspaceFlavoursService,
    private readonly profileRepo: WorkspaceProfileService,
    private readonly workspacesListService: WorkspaceListService
  ) {
    super();
  }
  pool = new ObjectPool<string, Workspace>({
    onDelete(workspace) {
      workspace.scope.dispose();
    },
    onDangling(workspace) {
      return workspace.canGracefulStop;
    },
  });

  /**
   * open workspace reference by metadata.
   *
   * You basically don't need to call this function directly, use the react hook `useWorkspace(metadata)` instead.
   *
   * @returns the workspace reference and a release function, don't forget to call release function when you don't
   * need the workspace anymore.
   */
  open = (
    options: WorkspaceOpenOptions,
    customEngineWorkerInitOptions?: WorkerInitOptions
  ): {
    workspace: Workspace;
    dispose: () => void;
  } => {
    if (options.isSharedMode) {
      const workspace = this.instantiate(
        options,
        customEngineWorkerInitOptions
      );
      return {
        workspace,
        dispose: () => {
          workspace.scope.dispose();
        },
      };
    }

    const exist = this.pool.get(options.metadata.id);
    if (exist) {
      return {
        workspace: exist.obj,
        dispose: exist.release,
      };
    }

    const workspace = this.instantiate(options, customEngineWorkerInitOptions);

    const ref = this.pool.put(workspace.meta.id, workspace);

    return {
      workspace: ref.obj,
      dispose: ref.release,
    };
  };

  openByWorkspaceId = (workspaceId: string) => {
    const workspaceMetadata =
      this.workspacesListService.list.workspace$(workspaceId).value;
    return workspaceMetadata && this.open({ metadata: workspaceMetadata });
  };

  instantiate(
    openOptions: WorkspaceOpenOptions,
    customEngineWorkerInitOptions?: WorkerInitOptions
  ) {
    logger.info(
      `open workspace [${openOptions.metadata.flavour}] ${openOptions.metadata.id} `
    );
    const flavourProvider = this.flavoursService.flavours$.value.find(
      p => p.flavour === openOptions.metadata.flavour
    );
    const engineWorkerInitOptions =
      customEngineWorkerInitOptions ??
      flavourProvider?.getEngineWorkerInitOptions(openOptions.metadata.id);
    if (!engineWorkerInitOptions) {
      throw new Error(
        `Unknown workspace flavour: ${openOptions.metadata.flavour}`
      );
    }

    const workspaceScope = this.framework.createScope(WorkspaceScope, {
      openOptions,
      engineWorkerInitOptions,
    });

    const workspace = workspaceScope.get(WorkspaceService).workspace;

    workspace.engine.start();

    workspaceScope.emitEvent(WorkspaceInitialized, workspace);

    flavourProvider?.onWorkspaceInitialized?.(workspace);

    this.profileRepo
      .getProfile(openOptions.metadata)
      .syncWithWorkspace(workspace);

    return workspace;
  }
}
