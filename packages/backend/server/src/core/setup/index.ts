import { Injectable, Module, NestMiddleware } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';

import { AuthModule } from '../auth';
import { UserModule } from '../user';
import { CustomSetupController } from './controller';

@Injectable()
export class SetupMiddleware implements NestMiddleware {
  private initialized: boolean | null = null;
  constructor(private readonly db: PrismaClient) {}

  use(req: Request, res: Response, next: (error?: Error | any) => void) {
    // never throw
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.allow().then(allowed => {
      if (allowed) {
        next();
      } else if (!req.path.startsWith('/admin/setup')) {
        res.redirect('/admin/setup');
      }
    });
  }

  async allow() {
    try {
      if (this.initialized === null) {
        this.initialized = (await this.db.user.count()) > 0;
      }
    } catch (e) {
      // avoid block the whole app
      return true;
    }

    return this.initialized;
  }
}

@Module({
  imports: [AuthModule, UserModule],
  controllers: [CustomSetupController],
})
export class CustomSetupModule {}
