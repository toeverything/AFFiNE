import { Module } from '@nestjs/common';

import { WindowsModule } from '../windows';
import { MeetingsSettingsState } from './meetings-settings-state.service';
import { RecordingManager } from './recording.service';
import { RecordingStateMachine } from './recording-state.service';

@Module({
  imports: [WindowsModule],
  providers: [RecordingManager, MeetingsSettingsState, RecordingStateMachine],
  exports: [RecordingManager, MeetingsSettingsState],
})
export class RecordingModule {}
