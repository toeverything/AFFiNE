import { Module } from '@nestjs/common';

import { AuthModule } from '../auth';
import { UserModule } from '../user';
import { CustomSetupController } from './controller';

@Module({
  imports: [AuthModule, UserModule],
  controllers: [CustomSetupController],
})
export class CustomSetupModule {}
