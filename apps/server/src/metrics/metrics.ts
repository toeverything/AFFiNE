import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { register } from 'prom-client';

import { metricsCreator } from './utils';

@Injectable()
export class Metrics implements OnModuleDestroy {
  onModuleDestroy(): void {
    register.clear();
  }

  socketIOEventCounter = metricsCreator.counter('socket_io_counter', ['event']);
  socketIOEventTimer = metricsCreator.timer('socket_io_timer', ['event']);
  socketIOConnectionGauge = metricsCreator.gauge(
    'socket_io_connection_counter'
  );

  gqlRequest = metricsCreator.counter('gql_request', ['operation']);
  gqlError = metricsCreator.counter('gql_error', ['operation']);
  gqlTimer = metricsCreator.timer('gql_timer', ['operation']);

  jwstCodecMerge = metricsCreator.counter('jwst_codec_merge');
  jwstCodecDidnotMatch = metricsCreator.counter('jwst_codec_didnot_match');
  jwstCodecFail = metricsCreator.counter('jwst_codec_fail');
}
