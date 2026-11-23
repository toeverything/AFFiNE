import { OnOptions } from 'eventemitter2';

import { PushMetadata, sliceMetadata } from '../nestjs/decorator';

declare global {
  /**
   * Event definitions can be extended by
   *
   * @example
   *
   * declare global {
   *   interface Events {
   *     'user.subscription.created': {
   *       userId: User['id'];
   *     }
   *   }
   * }
   */
  interface Events {}
}

export type EventName = keyof Events;
// Only these events may enter the local emitter from the shared Redis bridge.
const EVENT_DEFINITIONS = {
  'config.changed.broadcast': { broadcast: true },
  'copilot.delegated.editor.upserted': { broadcast: true },
  'copilot.delegated.editor.released': { broadcast: true },
  'copilot.delegated.tool.responded': { broadcast: true },
  'realtime.connection.disconnected': { broadcast: true },
  'realtime.topic.changed': { broadcast: true },
  'sync.permissions.changed': { broadcast: true },
  'sync.doc.updates.pushed': { broadcast: true },
  'sync.awareness.collect': { broadcast: true },
  'sync.awareness.updated': { broadcast: true },
} satisfies Partial<Record<EventName, { broadcast: boolean }>>;

export const BROADCASTABLE_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.entries(EVENT_DEFINITIONS)
    .filter(([, definition]) => definition.broadcast)
    .map(([name]) => name)
);

export const EVENT_LISTENER_METADATA = Symbol('event_listener');

interface EventHandlerMetadata {
  namespace: string;
  event: EventName;
  opts?: OnOptions;
}

export interface EventOptions extends OnOptions {
  prepend?: boolean;
  name?: string;
  suppressError?: boolean;
}

export const OnEvent = (event: EventName, opts?: EventOptions) => {
  const namespace = event.split('.')[0];
  return PushMetadata<EventHandlerMetadata>(EVENT_LISTENER_METADATA, {
    namespace,
    event,
    opts,
  });
};

export function getEventHandlerMetadata(target: any): EventHandlerMetadata[] {
  return sliceMetadata<EventHandlerMetadata>(EVENT_LISTENER_METADATA, target);
}
