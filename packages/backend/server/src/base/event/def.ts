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
