import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { register } from 'prom-client';

import { metricsCreator } from './utils';

@Injectable()
export class Metrics implements OnModuleDestroy {
  constructor() {}

  onModuleDestroy(): void {
    register.clear();
  }

  socketIOCounter = metricsCreator.counter('socket_io_counter', ['event']);
  socketIOTimer = metricsCreator.timer('socket_io_timer', ['event']);

  gqlRequest = metricsCreator.counter('gql_request', ['operation']);
  gqlError = metricsCreator.counter('gql_error', ['operation']);

  restRequest = metricsCreator.counter('rest_request', [
    'method',
    'path',
    'job',
  ]);

  restError = metricsCreator.counter('rest_error', ['method', 'path', 'job']);

  docApplyUpdateErr = metricsCreator.counter('doc_apply_update_err');
}
