import { Injectable } from '@nestjs/common';
import { once } from 'lodash-es';

import { ModuleScanner } from '../nestjs/scanner';
import {
  type EventName,
  type EventOptions,
  getEventHandlerMetadata,
} from './def';

@Injectable()
export class EventHandlerScanner {
  constructor(private readonly scanner: ModuleScanner) {}

  scan = once(() => {
    const handlers: Array<{
      event: EventName;
      handler: (payload: any) => any;
      opts?: EventOptions;
    }> = [];
    const providers = this.scanner.getAtInjectables();

    providers.forEach(wrapper => {
      const { instance, name } = wrapper;
      if (!instance || wrapper.isAlias) {
        return;
      }

      const methods = this.scanner.getAllMethodNames(instance);

      methods.forEach(method => {
        const fn = instance[method];

        let defs = getEventHandlerMetadata(instance[method]);

        if (defs.length === 0) {
          return;
        }

        const signature = `${name}.${method}`;

        if (typeof fn !== 'function') {
          throw new Error(`Event handler [${signature}] is not a function.`);
        }

        if (!wrapper.isDependencyTreeStatic()) {
          throw new Error(
            `Provider [${name}] could not be RequestScoped or TransientScoped injectable if it contains event handlers.`
          );
        }

        defs.forEach(({ event, opts }) => {
          handlers.push({
            event,
            handler: (payload: any) => {
              // NOTE(@forehalo):
              //   we might create spies on the event handlers when testing,
              //   avoid reusing `fn` variable to fail the spies or stubs
              return instance[method].bind(instance)(payload);
            },
            opts: {
              name: signature,
              ...opts,
            },
          });
        });
      });
    });
    return handlers;
  });
}
