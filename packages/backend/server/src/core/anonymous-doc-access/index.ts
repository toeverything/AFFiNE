import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { AnonymousDocAccessService } from './service';

@Module({
  imports: [DocStorageModule],
  providers: [AnonymousDocAccessService],
  exports: [AnonymousDocAccessService],
})
export class AnonymousDocAccessModule {}

export type {
  AnonymousDocGuestPrincipal,
  ResolvedAnonymousDocAccess,
} from './service';
export { AnonymousDocAccessService } from './service';
