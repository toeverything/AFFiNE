import { describe, expect, test } from 'vitest';

import { ServiceCollection, ServiceProvider } from '../../di';
import {
  createEvent,
  createEventHandler,
  EventHandler,
  EventService,
} from '..';

describe('Event', () => {
  test('basic', async () => {
    class TestService {
      name = 'test';
    }

    const aEvent = createEvent<{ hello: string }>('a');
    let world = '';

    const aEventHandler = createEventHandler(
      aEvent,
      (payload, test: TestService) => {
        world = `${payload.hello} ${test.name}`;
      },
      [TestService]
    );

    const services = new ServiceCollection();

    services
      .add(EventService, [[EventHandler], ServiceProvider])
      .add(TestService)
      .addImpl(EventHandler('test'), aEventHandler);

    const provider = services.provider();

    const eventService = provider.get(EventService);

    eventService.emit(aEvent, { hello: 'world' });

    expect(world).toBe('world test');
  });
});
