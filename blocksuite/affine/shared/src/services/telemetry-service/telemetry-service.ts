import { createIdentifier } from '@blocksuite/global/di';

import type { OutDatabaseAllEvents } from './database.js';
import type { LinkToolbarEvents } from './link.js';
import type { NoteEvents } from './note.js';
import type { SlashMenuEvents } from './slash-menu.js';
import type {
  AttachmentUploadedEvent,
  BlockCreationEvent,
  DocCreatedEvent,
  EdgelessToolPickedEvent,
  ElementCreationEvent,
  ElementLockEvent,
  ElementUpdatedEvent,
  LinkedDocCreatedEvent,
  LinkEvent,
  MindMapCollapseEvent,
  TelemetryEvent,
} from './types.js';

export type TelemetryEventMap = OutDatabaseAllEvents &
  LinkToolbarEvents &
  SlashMenuEvents &
  NoteEvents & {
    DocCreated: DocCreatedEvent;
    Link: TelemetryEvent;
    LinkedDocCreated: LinkedDocCreatedEvent;
    SplitNote: TelemetryEvent;
    CanvasElementAdded: ElementCreationEvent;
    CanvasElementUpdated: ElementUpdatedEvent;
    EdgelessElementLocked: ElementLockEvent;
    ExpandedAndCollapsed: MindMapCollapseEvent;
    AttachmentUploadedEvent: AttachmentUploadedEvent;
    BlockCreated: BlockCreationEvent;
    EdgelessToolPicked: EdgelessToolPickedEvent;
    CreateEmbedBlock: LinkEvent;
  };

export interface TelemetryService {
  track<T extends keyof TelemetryEventMap>(
    eventName: T,
    props: TelemetryEventMap[T]
  ): void;
}

export const TelemetryProvider = createIdentifier<TelemetryService>(
  'AffineTelemetryService'
);
