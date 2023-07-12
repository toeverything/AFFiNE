import { Injectable } from '@nestjs/common';

import { metricsCreator } from './utils';

@Injectable()
export class Metrics {
  constructor() {}

  socketIOCounter = metricsCreator.counter('socket_io_event_counter', [
    'event',
  ]);
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
