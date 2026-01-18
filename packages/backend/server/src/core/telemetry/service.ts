import { Injectable, Logger } from '@nestjs/common';

import { Config, OnEvent, URLHelper } from '../../base';
import { cleanTelemetryEvent } from './cleaner';
import { TelemetryDeduper } from './deduper';
import { Ga4Client } from './ga4-client';
import { TelemetryAck, TelemetryBatch } from './types';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private allowedOrigins: string[] = [];
  private ga4Client!: Ga4Client;
  private readonly deduper: TelemetryDeduper;

  constructor(
    private readonly config: Config,
    private readonly url: URLHelper
  ) {
    this.deduper = new TelemetryDeduper(
      this.config.telemetry.dedupe.ttlHours * 60 * 60 * 1000,
      this.config.telemetry.dedupe.maxEntries
    );
    this.refreshConfig();
  }

  @OnEvent('config.init')
  onConfigInit() {
    this.refreshConfig();
  }

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if ('telemetry' in event.updates) {
      this.refreshConfig();
    }
  }

  getCorsHeaders(origin?: string | string[] | null) {
    const normalized = Array.isArray(origin) ? origin[0] : origin;
    if (normalized) {
      return {
        'Access-Control-Allow-Origin': normalized,
      };
    }
    return {};
  }

  isOriginAllowed(origin?: string | string[] | null, referer?: string | null) {
    const normalizedOrigin = Array.isArray(origin) ? origin[0] : origin;
    if (!normalizedOrigin && !referer) {
      return true;
    }

    const originAllowed = normalizedOrigin
      ? this.allowedOrigins.includes(normalizedOrigin)
      : false;
    if (originAllowed) {
      return true;
    }

    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        return this.allowedOrigins.includes(refererOrigin);
      } catch {
        return false;
      }
    }

    return false;
  }

  async collectBatch(batch: TelemetryBatch): Promise<TelemetryAck> {
    if (!batch || batch.schemaVersion !== 1 || !Array.isArray(batch.events)) {
      return {
        ok: true,
        accepted: 0,
        dropped: 0,
      };
    }

    const events = batch.events;
    let dropped = 0;

    const cleanedEvents = [];
    const fallbackTimestamp =
      typeof batch.sentAt === 'number' && Number.isFinite(batch.sentAt)
        ? batch.sentAt * 1000
        : Date.now() * 1000;

    for (const event of events) {
      const timestampMicros =
        typeof event.timestampMicros === 'number' &&
        Number.isFinite(event.timestampMicros)
          ? event.timestampMicros
          : fallbackTimestamp;

      const cleaned = cleanTelemetryEvent(event, {
        userId: event.userId,
        timestampMicros,
        maxParams: 25,
      });

      if (!cleaned) {
        dropped++;
        continue;
      }

      const dedupeKey = `${cleaned.clientId}:${cleaned.eventId}`;
      if (this.deduper.isDuplicate(dedupeKey)) {
        dropped++;
        continue;
      }

      cleanedEvents.push(cleaned);
    }

    if (!cleanedEvents.length) {
      return {
        ok: true,
        accepted: 0,
        dropped,
      };
    }

    try {
      await this.ga4Client.send(cleanedEvents);
      return {
        ok: true,
        accepted: cleanedEvents.length,
        dropped,
      };
    } catch (error) {
      const err = error as Error;
      if (env.dev) {
        this.logger.error('Telemetry forwarding failed', err);
        return {
          ok: false,
          error: {
            name: err?.name ?? 'TelemetryForwardingError',
            message: err?.message ?? 'Telemetry forwarding failed',
          },
        };
      } else {
        return {
          ok: false,
          error: {
            name: 'TelemetryForwardingError',
            message: 'Telemetry forwarding failed',
          },
        };
      }
    }
  }

  private refreshConfig() {
    const normalizeOrigin = (input: string) => {
      const candidate = input.includes('://') ? input : `http://${input}`;
      try {
        const url = new URL(candidate);
        if (!['http:', 'https:', 'assets:'].includes(url.protocol)) {
          return null;
        } else if (url.protocol === 'assets:') {
          return url.href;
        }
        return url.origin;
      } catch {
        return null;
      }
    };

    const configOrigins = this.config.telemetry.allowedOrigin
      .map(origin => normalizeOrigin(origin))
      .filter((origin): origin is string => Boolean(origin));

    this.allowedOrigins = Array.from(
      new Set([...configOrigins, ...this.url.allowedOrigins])
    );

    this.logger.log(
      `Telemetry allowed origins updated: ${this.allowedOrigins.join(', ')}`
    );

    this.ga4Client = new Ga4Client(
      this.config.telemetry.ga4.measurementId,
      this.config.telemetry.ga4.apiSecret,
      Math.max(1, this.config.telemetry.batch.maxEvents)
    );
  }
}
