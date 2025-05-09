import './config';

import { Module } from '@nestjs/common';

import { VersionGuardProvider } from './guard';
import { VersionService } from './service';

@Module({
  providers: [VersionService, VersionGuardProvider],
})
export class VersionModule {}

export type { VersionConfig } from './config';
