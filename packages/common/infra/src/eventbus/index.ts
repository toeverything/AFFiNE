import type { ServiceProvider, TypesToDeps } from '../di';
import { createIdentifier, dependenciesToFactory } from '../di';

/**
 *
 * @example
 * ```ts
 * // define a event
 * const SomeEvent = createEvent<{ data: number }>("someThing");
 *
 * // create a event handler
 * const SomeEventHandler = createEventHandler(
 *   SomeEvent,
 *   (payload, otherService: OtherService) => {
 *     expect(payload.data).toBe(1);
 *   },
 *   [OtherService]
 * // ^ dependencies
 * );
 *
 * // register both to service collection
 * const services = new ServiceCollection();
 * services.add(EventService, [[EventHandler], ServiceProvider]);
 * services.addImpl(EventHandler('test'), SomeEventHandler);
 * //                            ^ unique name to deduplicate
 *
 * // emit event
 * const provider = services.provider();
 * const eventService = provider.get(EventService);
 * eventService.emit(SomeEvent, { data: 1 });
 * ```
 */
export class EventService {
  listeners: Map<
    string,
    Set<(payload: any, serviceProvider: ServiceProvider) => void>
  > = new Map();

  constructor(
    eventHandlers: EventHandler<any>[],
    private readonly provider: ServiceProvider
  ) {
    for (const eventHandler of eventHandlers) {
      this.register(eventHandler);
    }
  }

  register(eventHandler: EventHandler<any>) {
    const listeners = this.listeners.get(eventHandler.event.name) ?? new Set();
    listeners.add(eventHandler.cb);
    this.listeners.set(eventHandler.event.name, listeners);
    return () => {
      this.listeners.get(eventHandler.event.name)?.delete(eventHandler.cb);
    };
  }

  emit<T>(event: Event<T>, payload: T) {
    const listeners = this.listeners.get(event.name);
    if (listeners) {
      listeners.forEach(listener => listener(payload, this.provider));
    }
  }
}

export const GlobalEventService =
  createIdentifier<EventService>('GlobalEventService');

export interface Event<T> {
  name: string;
  type: T;
}

export interface EventHandler<T> {
  event: Event<T>;
  cb: (payload: T, provider: ServiceProvider) => void;
}

export const EventHandler = createIdentifier<EventHandler<any>>('EventHandler');

export function createEvent<T>(name: string): Event<T> {
  return {
    name: name,
    type: null as T,
  };
}

export function createEventHandler<
  E extends Event<any>,
  Callback extends (payload: E['type'], ...args: any[]) => void,
  DepsArgs extends any[] = Callback extends (
    payload: any,
    ...deps: infer Deps
  ) => void
    ? Deps
    : [],
  Deps extends TypesToDeps<DepsArgs> = TypesToDeps<DepsArgs>,
>(
  event: E,
  cb: Callback,
  ...deps: Deps extends [] ? [] : [Deps]
): EventHandler<E['type']> {
  return {
    event,
    cb: (payload, provider) => {
      dependenciesToFactory((...args: any[]) => {
        cb(payload, ...args);
      }, deps[0] ?? [])(provider);
    },
  };
}
