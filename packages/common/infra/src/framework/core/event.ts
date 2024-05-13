import { DebugLogger } from '@affine/debug';

import { stableHash } from '../../utils';
import type { FrameworkProvider } from '.';
import type { Service } from './components/service';
import { SUB_COMPONENTS } from './consts';
import { createIdentifier } from './identifier';
import type { SubComponent } from './types';

export interface FrameworkEvent<T> {
  id: string;
  _type: T;
}

export function createEvent<T>(id: string): FrameworkEvent<T> {
  return { id, _type: {} as T };
}

export type FrameworkEventType<T> =
  T extends FrameworkEvent<infer E> ? E : never;

const logger = new DebugLogger('affine:event-bus');

export class EventBus {
  private listeners: Record<string, Array<(payload: any) => void>> = {};

  constructor(
    provider: FrameworkProvider,
    private readonly parent?: EventBus
  ) {
    const handlers = provider.getAll(EventHandler, {
      sameScope: true,
    });

    for (const handler of handlers.values()) {
      this.on(handler.event.id, handler.handler);
    }
  }

  get root(): EventBus {
    return this.parent?.root ?? this;
  }

  on<T>(id: string, listener: (event: FrameworkEvent<T>) => void) {
    if (!this.listeners[id]) {
      this.listeners[id] = [];
    }
    this.listeners[id].push(listener);
    const off = this.parent?.on(id, listener);
    return () => {
      this.off(id, listener);
      off?.();
    };
  }

  off<T>(id: string, listener: (event: FrameworkEvent<T>) => void) {
    if (!this.listeners[id]) {
      return;
    }
    this.listeners[id] = this.listeners[id].filter(l => l !== listener);
  }

  emit<T>(event: FrameworkEvent<T>, payload: T) {
    logger.debug('Emitting event', event.id, payload);
    const listeners = this.listeners[event.id];
    if (!listeners) {
      return;
    }
    listeners.forEach(listener => {
      try {
        listener(payload);
      } catch (e) {
        console.error(e);
      }
    });
  }
}

interface EventHandler {
  event: FrameworkEvent<any>;
  handler: (payload: any) => void;
}

export const EventHandler = createIdentifier<EventHandler>('EventHandler');

export const OnEvent = <
  E extends FrameworkEvent<any>,
  C extends abstract new (...args: any) => any,
  I = InstanceType<C>,
>(
  e: E,
  pick: I extends Service ? (i: I) => (e: FrameworkEventType<E>) => void : never
) => {
  return (target: C): C => {
    const handlers = (target as any)[SUB_COMPONENTS] ?? [];
    (target as any)[SUB_COMPONENTS] = [
      ...handlers,
      {
        identifier: EventHandler(
          target.name + stableHash(e) + stableHash(pick)
        ),
        factory: provider => {
          return {
            event: e,
            handler: (payload: any) => {
              const i = provider.get(target);
              pick(i).apply(i, [payload]);
            },
          } satisfies EventHandler;
        },
      } satisfies SubComponent,
    ];
    return target;
  };
};
