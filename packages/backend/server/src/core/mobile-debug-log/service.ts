import { Injectable, Logger } from '@nestjs/common';

import { ActionForbidden, Config } from '../../base';
import type { MobileDebugLogAck, MobileDebugLogBatch } from './types';

// No framework-level body-size limit is configured for this route (Express
// defaults apply), so this service self-enforces caps on entry count and
// per-message length instead of trusting the framework.
const MAX_ENTRIES_PER_REQUEST = 500;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_CLIENT_ID_LENGTH = 100;

@Injectable()
export class MobileDebugLogService {
  private readonly logger = new Logger('MobileDebugLog');

  constructor(private readonly config: Config) {}

  ingest(batch: MobileDebugLogBatch, userId: string): MobileDebugLogAck {
    // Read fresh on every call (never cached) so a live admin config update
    // takes effect without a server restart.
    if (!this.config.mobileDebugLog.enabled) {
      throw new ActionForbidden('Mobile debug log collection is disabled');
    }

    if (
      !batch ||
      typeof batch.clientId !== 'string' ||
      !Array.isArray(batch.entries)
    ) {
      return { ok: true, accepted: 0, dropped: 0 };
    }

    const clientId = batch.clientId.slice(0, MAX_CLIENT_ID_LENGTH);

    const entries = batch.entries;
    let dropped = Math.max(0, entries.length - MAX_ENTRIES_PER_REQUEST);
    const surviving = entries.slice(0, MAX_ENTRIES_PER_REQUEST);

    let accepted = 0;
    for (const entry of surviving) {
      if (!entry || typeof entry.message !== 'string' || !entry.message) {
        dropped++;
        continue;
      }

      let message = entry.message;
      if (message.length > MAX_MESSAGE_LENGTH) {
        message = `${message.slice(0, MAX_MESSAGE_LENGTH)}...[truncated]`;
      }

      this.logger.log(`client=${clientId} user=${userId} ${message}`);
      accepted++;
    }

    return { ok: true, accepted, dropped };
  }
}
