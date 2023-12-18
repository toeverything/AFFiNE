import type { ServiceCollection, ServiceProvider } from '../di';

export class EventBus {
  listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  on(event: string, listener: (...args: any[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  emit(event: string, ...args: any[]) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
    }
  }
}

const EVENT_HANDLER_SERVICE_TYPE = 'event-handler';

export function installEventBus(services: ServiceCollection) {
  services.addFactory(EventBus, () => new EventBus());
}

export function resolveEventHandlers(services: ServiceProvider) {
  return services.resolveAll(EVENT_HANDLER_SERVICE_TYPE);
}

export function installEventHandler(
  eventName: string,
  handlerName: string,
  handler: (...args: any[]) => void
) {
  return (services: ServiceCollection) => {
    services.add(
      EVENT_HANDLER_SERVICE_TYPE,
      handler,
      `${eventName}:${handlerName}`
    );
  };
}

export function installEventHandlerFactory(
  eventName: string,
  handlerName: string,
  handlerFactory: (services: ServiceProvider) => (...args: any[]) => void
) {
  return (services: ServiceCollection) => {
    services.addFactory(
      EVENT_HANDLER_SERVICE_TYPE,
      handlerFactory,
      `${eventName}:${handlerName}`
    );
  };
}
