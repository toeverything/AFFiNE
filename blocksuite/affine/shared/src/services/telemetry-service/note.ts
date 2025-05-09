import type { TelemetryEvent } from './types.js';

export type NoteEventType = 'NoteDisplayModeChanged';

export type NoteEvents = {
  NoteDisplayModeChanged: TelemetryEvent & {
    control: 'display mode';
    type: 'note';
  };
  EdgelessNoteEditing: TelemetryEvent;
};
