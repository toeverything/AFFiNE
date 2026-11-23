import { Injectable } from '@nestjs/common';

import { GuardProvider } from '../../base/guard';

declare module '../../base/guard' {
  interface RegisterGuardName {
    selfhost: 'selfhost';
  }
}

@Injectable()
export class SelfhostGuard extends GuardProvider {
  override name = 'selfhost' as const;

  override canActivate() {
    return env.selfhosted;
  }
}
