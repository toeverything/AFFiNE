import './config';

import { Global, Module } from '@nestjs/common';

import { CryptoHelper } from './crypto';
import { URLHelper } from './url';

@Global()
@Module({
  providers: [URLHelper, CryptoHelper],
  exports: [URLHelper, CryptoHelper],
})
export class HelpersModule {}

export { CryptoHelper, URLHelper };
