import type {
  MeetingSettingsKey,
  MeetingSettingsSchema,
} from '@affine/electron/main/shared-state-schema';
import { LiveData, Service } from '@toeverything/infra';
import { defaults } from 'lodash-es';

import { DesktopApiService } from '../../desktop-api';
import type { GlobalStateService } from '../../storage';

const MEETING_SETTINGS_KEY: typeof MeetingSettingsKey = 'meetingSettings';

const defaultMeetingSettings: MeetingSettingsSchema = {
  enabled: false,
  betaDisclaimerAccepted: false,
  recordingSavingMode: 'new-doc',
  autoTranscriptionSummary: true,
  autoTranscriptionTodo: true,
  recordingMode: 'prompt',
};

export class MeetingSettingsService extends Service {
  constructor(private readonly globalStateService: GlobalStateService) {
    super();
  }

  private readonly desktopApiService =
    this.framework.getOptional(DesktopApiService);

  readonly settings$ = LiveData.computed(get => {
    const value = get(
      LiveData.from(
        this.globalStateService.globalState.watch<MeetingSettingsSchema>(
          MEETING_SETTINGS_KEY
        ),
        undefined
      )
    );
    return defaults(value, defaultMeetingSettings);
  });

  get settings() {
    return this.settings$.value;
  }

  setBetaDisclaimerAccepted(accepted: boolean) {
    this.globalStateService.globalState.set(MEETING_SETTINGS_KEY, {
      ...this.settings$.value,
      betaDisclaimerAccepted: accepted,
    });
  }

  // we do not want the caller to directly set the settings,
  // there could be some side effects when the settings are changed.
  async setEnabled(enabled: boolean) {
    const currentEnabled = this.settings.enabled;
    if (currentEnabled === enabled) {
      return;
    }

    if (!(await this.isRecordingFeatureAvailable())) {
      return;
    }

    this.globalStateService.globalState.set(MEETING_SETTINGS_KEY, {
      ...this.settings$.value,
      enabled,
    });

    // when the user enable the recording feature the first time,
    // the app may prompt the user to allow the recording feature by MacOS.
    // when the user allows the recording feature, the app may be required to restart.
    if (enabled) {
      // if the user already enabled the recording feature, we need to disable it
      const successful =
        await this.desktopApiService?.handler.recording.setupRecordingFeature();
      if (!successful) {
        throw new Error('Failed to setup recording feature');
      }
    } else {
      // check if there is any ongoing recording
      const ongoingRecording =
        await this.desktopApiService?.handler.recording.getCurrentRecording();
      if (
        ongoingRecording &&
        ongoingRecording.status !== 'new' &&
        ongoingRecording.status !== 'ready'
      ) {
        throw new Error('There is an ongoing recording, please stop it first');
      }
      // if the user disabled the recording feature, we need to setup the recording feature
      await this.desktopApiService?.handler.recording.disableRecordingFeature();
    }
  }

  setRecordingSavingMode(mode: MeetingSettingsSchema['recordingSavingMode']) {
    this.globalStateService.globalState.set(MEETING_SETTINGS_KEY, {
      ...this.settings$.value,
      recordingSavingMode: mode,
    });
  }

  setAutoSummary(autoSummary: boolean) {
    this.globalStateService.globalState.set(MEETING_SETTINGS_KEY, {
      ...this.settings$.value,
      autoTranscriptionSummary: autoSummary,
    });
  }

  setAutoTodo(autoTodo: boolean) {
    this.globalStateService.globalState.set(MEETING_SETTINGS_KEY, {
      ...this.settings$.value,
      autoTranscriptionTodo: autoTodo,
    });
  }

  // this is a desktop-only feature for MacOS version 14.2 and above
  async isRecordingFeatureAvailable() {
    return this.desktopApiService?.handler.recording.checkRecordingAvailable();
  }

  async checkMeetingPermissions() {
    return this.desktopApiService?.handler.recording.checkMeetingPermissions();
  }

  // the following methods are only available on MacOS right?
  async showRecordingPermissionSetting(type: 'screen' | 'microphone') {
    return this.desktopApiService?.handler.recording.showRecordingPermissionSetting(
      type
    );
  }

  async askForMeetingPermission(type: 'microphone' | 'screen') {
    return this.desktopApiService?.handler.recording.askForMeetingPermission(
      type
    );
  }

  setRecordingMode = (mode: MeetingSettingsSchema['recordingMode']) => {
    const currentMode = this.settings.recordingMode;

    if (currentMode === mode) {
      return;
    }

    this.globalStateService.globalState.set(MEETING_SETTINGS_KEY, {
      ...this.settings,
      recordingMode: mode,
    });
  };

  async openSavedRecordings() {
    // todo: open the saved recordings folder
    await this.desktopApiService?.handler.recording.showSavedRecordings();
  }
}
