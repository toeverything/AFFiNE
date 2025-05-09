import type { TelemetryEvent } from './types.js';

export type SlashMenuEventType = 'OpenSlashMenu' | 'SelectSlashMenuItem';

export type SlashMenuEvents = Record<SlashMenuEventType, TelemetryEvent>;
