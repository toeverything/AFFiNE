import { Module } from '@nestjs/common';

import { StaticFilesResolver } from './static';

@Module({
  providers: [StaticFilesResolver],
})
export class StaticFileModule {}
