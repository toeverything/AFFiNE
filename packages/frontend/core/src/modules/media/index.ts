import type { Framework } from '@toeverything/infra';

import { DefaultServerService, WorkspaceServerService } from '../cloud';
import { GlobalState, GlobalStateService } from '../storage';
import { WorkbenchService } from '../workbench';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { AudioAttachmentBlock } from './entities/audio-attachment-block';
import { AudioMedia } from './entities/audio-media';
import { AudioTranscriptionJob } from './entities/audio-transcription-job';
import { AudioTranscriptionJobStore } from './entities/audio-transcription-job-store';
import {
  ElectronGlobalMediaStateProvider,
  GlobalMediaStateProvider,
  WebGlobalMediaStateProvider,
} from './providers/global-audio-state';
import { AudioAttachmentService } from './services/audio-attachment';
import { AudioMediaManagerService } from './services/audio-media-manager';
import { MeetingSettingsService } from './services/meeting-settings';

export function configureMediaModule(framework: Framework) {
  framework
    .service(MeetingSettingsService, [GlobalStateService])
    .scope(WorkspaceScope)
    .entity(AudioMedia, [WorkspaceService])
    .entity(AudioAttachmentBlock, [
      AudioMediaManagerService,
      WorkspaceService,
      MeetingSettingsService,
    ])
    .entity(AudioTranscriptionJob, [
      WorkspaceServerService,
      DefaultServerService,
    ])
    .entity(AudioTranscriptionJobStore, [
      WorkspaceService,
      WorkspaceServerService,
      DefaultServerService,
    ])
    .service(AudioAttachmentService)
    .service(AudioMediaManagerService, [
      GlobalMediaStateProvider,
      WorkbenchService,
    ]);

  if (BUILD_CONFIG.isElectron) {
    framework.impl(GlobalMediaStateProvider, ElectronGlobalMediaStateProvider, [
      GlobalState,
    ]);
  } else {
    framework.impl(GlobalMediaStateProvider, WebGlobalMediaStateProvider);
  }
}

export { AudioMedia, AudioMediaManagerService };
