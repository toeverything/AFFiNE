import { Module } from '@nestjs/common';

import { AppModule as BusinessAppModule } from '../../../app.module';
import { ConfigModule } from '../../../fundamentals/config';
import { CreateCommand, NameQuestion } from './create';

@Module({
  imports: [
    ConfigModule.forRoot({
      doc: {
        manager: {
          enableUpdateAutoMerging: false,
        },
      },
      metrics: {
        enabled: false,
        customerIo: {},
      },
    }),
    BusinessAppModule,
  ],
  providers: [NameQuestion, CreateCommand],
})
export class CliAppModule {}
