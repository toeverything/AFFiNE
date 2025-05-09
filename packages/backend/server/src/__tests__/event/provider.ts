import { Injectable } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';

import { genRequestId, OnEvent } from '../../base';

declare global {
  interface Events {
    '__test__.event': { count: number };
    '__test__.event2': { count: number };
    '__test__.throw': { count: number };
    '__test__.suppressThrow': {};
    '__test__.requestId': {};
  }
}

@Injectable()
export class Listeners {
  @OnEvent('__test__.event')
  onTestEvent(payload: Events['__test__.event']) {
    return payload;
  }

  @OnEvent('__test__.event')
  @OnEvent('__test__.event2')
  onTestEventAndEvent2(
    payload: Events['__test__.event'] | Events['__test__.event2']
  ) {
    return payload;
  }

  @OnEvent('__test__.throw')
  onThrow() {
    throw new Error('Error in event handler');
  }

  @OnEvent('__test__.suppressThrow', { suppressError: true })
  onSuppressThrow() {
    throw new Error('Error in event handler');
  }

  @OnEvent('__test__.requestId')
  onRequestId() {
    const cls = ClsServiceManager.getClsService();
    return cls.getId() ?? genRequestId('event');
  }
}
