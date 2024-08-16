import { DebugLogger } from '@affine/debug';

import { fixWorkspaceVersion } from '../../../blocksuite';
import { Service } from '../../../framework';
import { ObjectPool } from '../../../utils';
import type { Workspace } from '../entities/workspace';
import { WorkspaceInitialized } from '../events';
import type { WorkspaceOpenOptions } from '../open-options';
import type {
  WorkspaceEngineProvider,
  WorkspaceFlavourProvider,
} from '../providers/flavour';
import { WorkspaceScope } from '../scopes/workspace';
import type { WorkspaceProfileService } from './profile';
import { WorkspaceService } from './workspace';

const logger = new DebugLogger('affine:workspace-repository');

export class WorkspaceRepositoryService extends Service {
  constructor(
    private readonly providers: WorkspaceFlavourProvider[],
    private readonly profileRepo: WorkspaceProfileService
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
    customProvider?: WorkspaceEngineProvider
  ): {
    workspace: Workspace;
    dispose: () => void;
  } => {
    if (options.isSharedMode) {
      const workspace = this.instantiate(options, customProvider);
      return {
        workspace,
        dispose: () => {
          workspace.dispose();
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

    const workspace = this.instantiate(options, customProvider);
    // sync information with workspace list, when workspace's avatar and name changed, information will be updated
    // this.list.getInformation(metadata).syncWithWorkspace(workspace);

    const ref = this.pool.put(workspace.meta.id, workspace);

    return {
      workspace: ref.obj,
      dispose: ref.release,
    };
  };

  instantiate(
    openOptions: WorkspaceOpenOptions,
    customProvider?: WorkspaceEngineProvider
  ) {
    logger.info(
      `open workspace [${openOptions.metadata.flavour}] ${openOptions.metadata.id} `
    );
    const provider =
      customProvider ??
      this.providers
        .find(p => p.flavour === openOptions.metadata.flavour)
        ?.getEngineProvider(openOptions.metadata.id);
    if (!provider) {
      throw new Error(
        `Unknown workspace flavour: ${openOptions.metadata.flavour}`
      );
    }

    const workspaceScope = this.framework.createScope(WorkspaceScope, {
      openOptions,
      engineProvider: provider,
    });

    const workspace = workspaceScope.get(WorkspaceService).workspace;

    workspace.engine.setRootDoc(workspace.docCollection.doc);
    workspace.engine.start();

    // apply compatibility fix
    fixWorkspaceVersion(workspace.docCollection.doc);

    this.framework.emitEvent(WorkspaceInitialized, workspace);

    this.profileRepo
      .getProfile(openOptions.metadata)
      .syncWithWorkspace(workspace);

    return workspace;
  }
}
