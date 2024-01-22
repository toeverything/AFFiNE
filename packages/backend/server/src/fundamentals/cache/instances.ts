import { Injectable } from '@nestjs/common';

import { LocalCache } from './local';

@Injectable()
export class Cache extends LocalCache {}

@Injectable()
export class SessionCache extends LocalCache {
  constructor() {
    super({ namespace: 'session' });
  }
}
