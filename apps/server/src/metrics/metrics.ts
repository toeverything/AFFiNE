import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { register } from 'prom-client';

import { metricsCreator } from './utils';

@Injectable()
export class Metrics implements OnModuleDestroy {
  onModuleDestroy(): void {
    register.clear();
  }

  socketIOCounter = metricsCreator.counter('socket_io_counter', ['event']);
  socketIOTimer = metricsCreator.timer('socket_io_timer', ['event']);

  gqlRequest = metricsCreator.counter('gql_request', ['operation']);
  gqlError = metricsCreator.counter('gql_error', ['operation']);
}
