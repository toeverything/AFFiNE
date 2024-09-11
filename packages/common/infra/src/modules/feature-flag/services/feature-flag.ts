import { distinctUntilChanged, skip } from 'rxjs';

import { OnEvent, Service } from '../../../framework';
import { ApplicationStarted } from '../../lifecycle';
import type { Workspace } from '../../workspace';
import { WorkspaceInitialized } from '../../workspace/events';
import { AFFINE_FLAGS } from '../constant';
import { Flags, type FlagsExt } from '../entities/flags';

@OnEvent(WorkspaceInitialized, e => e.setupBlocksuiteEditorFlags)
@OnEvent(ApplicationStarted, e => e.setupRestartListener)
export class FeatureFlagService extends Service {
  flags = this.framework.createEntity(Flags) as FlagsExt;

  setupBlocksuiteEditorFlags(workspace: Workspace) {
    for (const [key, flag] of Object.entries(AFFINE_FLAGS)) {
      if (flag.category === 'blocksuite') {
        const value = this.flags[key as keyof AFFINE_FLAGS].value;
        if (value !== undefined) {
          workspace.docCollection.awarenessStore.setFlag(flag.bsFlag, value);
        }
      }
    }
  }

  setupRestartListener() {
    this.flags.enable_ai.$.pipe(distinctUntilChanged(), skip(1)).subscribe(
      () => {
        // when enable_ai flag changes, reload the page.
        window.location.reload();
      }
    );
  }
}
