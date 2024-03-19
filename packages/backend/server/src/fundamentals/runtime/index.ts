import { Global, Module } from '@nestjs/common';

import { DefaultRuntimeConfigsProvider } from './def';
import { Runtime } from './service';

@Global()
@Module({
  providers: [Runtime, DefaultRuntimeConfigsProvider],
  exports: [Runtime],
})
export class RuntimeSettingModule {}
export { Runtime };
