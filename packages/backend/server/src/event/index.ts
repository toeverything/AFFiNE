import { Global, Injectable, Module } from '@nestjs/common';
import {
  EventEmitter2,
  EventEmitterModule,
  OnEvent as RawOnEvent,
} from '@nestjs/event-emitter';

import { Event, EventPayload } from './events';

@Injectable()
export class EventEmitter {
  constructor(private readonly emitter: EventEmitter2) {}

  emit<E extends Event>(event: E, payload: EventPayload<E>) {
    return this.emitter.emit(event, payload);
  }

  emitAsync<E extends Event>(event: E, payload: EventPayload<E>) {
    return this.emitter.emitAsync(event, payload);
  }

  on<E extends Event>(event: E, handler: (payload: EventPayload<E>) => void) {
    return this.emitter.on(event, handler);
  }

  once<E extends Event>(event: E, handler: (payload: EventPayload<E>) => void) {
    return this.emitter.once(event, handler);
  }
}

export const OnEvent = (
  event: Event,
  opts?: Parameters<typeof RawOnEvent>[1]
) => {
  return RawOnEvent(event, opts);
};

@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [EventEmitter],
  exports: [EventEmitter],
})
export class EventModule {}
