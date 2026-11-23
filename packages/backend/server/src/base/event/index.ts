import { Global, Module } from '@nestjs/common';
import EventEmitter2 from 'eventemitter2';

import { EventBus } from './eventbus';
import { EventHandlerScanner } from './scanner';

const EmitProvider = {
  provide: EventEmitter2,
  useFactory: () =>
    new EventEmitter2({
      maxListeners: 100,
    }),
};

@Global()
@Module({
  providers: [EventBus, EventHandlerScanner, EmitProvider],
  exports: [EventBus],
})
export class EventModule {}

export { EventBus };
export { OnEvent } from './def';
