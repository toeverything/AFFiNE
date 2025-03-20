import type { Framework } from '@toeverything/infra';

import { DesktopApiService } from '../desktop-api';
import { GlobalState } from '../storage';
import { WorkbenchService } from '../workbench';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { AudioAttachmentBlock } from './entities/audio-attachment-block';
import { AudioMedia } from './entities/audio-media';
import {
  ElectronGlobalMediaStateProvider,
  GlobalMediaStateProvider,
  WebGlobalMediaStateProvider,
} from './providers/global-audio-state';
import { AudioAttachmentService } from './services/audio-attachment';
import { AudioMediaManagerService } from './services/audio-media-manager';

export function configureMediaModule(framework: Framework) {
  if (BUILD_CONFIG.isElectron) {
    framework
      .impl(GlobalMediaStateProvider, ElectronGlobalMediaStateProvider, [
        GlobalState,
      ])
      .scope(WorkspaceScope)
      .entity(AudioMedia, [WorkspaceService])
      .entity(AudioAttachmentBlock, [AudioMediaManagerService])
      .service(AudioMediaManagerService, [
        GlobalMediaStateProvider,
        WorkbenchService,
        DesktopApiService,
      ])
      .service(AudioAttachmentService);
  } else {
    framework
      .impl(GlobalMediaStateProvider, WebGlobalMediaStateProvider)
      .scope(WorkspaceScope)
      .entity(AudioMedia, [WorkspaceService])
      .entity(AudioAttachmentBlock, [AudioMediaManagerService])
      .service(AudioMediaManagerService, [
        GlobalMediaStateProvider,
        WorkbenchService,
      ])
      .service(AudioAttachmentService);
  }
}

export { AudioMedia, AudioMediaManagerService };
