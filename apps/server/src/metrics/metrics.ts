import { Injectable } from '@nestjs/common';

import { metricsCreator } from './utils';

@Injectable()
export class Metrics {
  constructor() {}

  socketIOCounter = metricsCreator.counter(
    'socket_io_event_counter',
    'socket_io_event_counter',
    ['event']
  );
  socketIOTimer = metricsCreator.timer('socket_io_timer', 'socket_io_timer', [
    'event',
  ]);
}
