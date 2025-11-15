import type { TelemetryEvent } from './types';
export type CitationEventType =
  | 'AICitationHoverSource'
  | 'AICitationExpandSource'
  | 'AICitationDelete'
  | 'AICitationEdit';

export type CitationEvents = Record<CitationEventType, TelemetryEvent>;
