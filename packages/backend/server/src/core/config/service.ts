import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ServerService {
  private _initialized: boolean | null = null;
  constructor(private readonly db: PrismaClient) {}

  async initialized() {
    if (!this._initialized) {
      const userCount = await this.db.user.count();
      this._initialized = userCount > 0;
    }

    return this._initialized;
  }
}
