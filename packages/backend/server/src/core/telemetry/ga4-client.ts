import { CleanedTelemetryEvent, Scalar } from './cleaner';

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

type Ga4Payload = {
  client_id: string;
  user_id?: string;
  user_properties?: Record<string, { value: string }>;
  events: Array<{
    name: string;
    params: Record<string, Scalar>;
    timestamp_micros?: number;
  }>;
};

export class Ga4Client {
  constructor(
    private readonly measurementId: string,
    private readonly apiSecret: string,
    private readonly maxEvents: number
  ) {}

  async send(events: CleanedTelemetryEvent[]) {
    if (!events.length) {
      return;
    }

    if (!this.measurementId || !this.apiSecret) {
      return;
    }

    const groups = groupEvents(events);
    for (const group of groups) {
      for (const chunk of chunkEvents(group.events, this.maxEvents)) {
        const payload: Ga4Payload = {
          client_id: group.clientId,
          user_id: group.userId,
          user_properties: toUserProperties(group.userProperties),
          events: chunk.map(event => ({
            name: event.eventName,
            params: event.params,
            timestamp_micros: event.timestampMicros,
          })),
        };

        await this.post(payload);
      }
    }
  }

  private async post(payload: Ga4Payload) {
    const url = new URL(GA4_ENDPOINT);
    url.searchParams.set('measurement_id', this.measurementId);
    url.searchParams.set('api_secret', this.apiSecret);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `GA4 request failed with ${response.status}: ${body || 'unknown error'}`
      );
    }
  }
}

type GroupKey = {
  clientId: string;
  userId?: string;
  userProperties: Record<string, string>;
  events: CleanedTelemetryEvent[];
};

function groupEvents(events: CleanedTelemetryEvent[]): GroupKey[] {
  const grouped = new Map<string, GroupKey>();

  for (const event of events) {
    const key = `${event.clientId}::${event.userId ?? ''}::${serializeUserProps(event.userProperties)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.events.push(event);
    } else {
      grouped.set(key, {
        clientId: event.clientId,
        userId: event.userId,
        userProperties: event.userProperties,
        events: [event],
      });
    }
  }

  return Array.from(grouped.values());
}

function serializeUserProps(props: Record<string, string>) {
  const entries = Object.entries(props).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function toUserProperties(props: Record<string, string>) {
  const userProperties: Record<string, { value: string }> = {};
  for (const [key, value] of Object.entries(props)) {
    userProperties[key] = { value };
  }
  return Object.keys(userProperties).length ? userProperties : undefined;
}

function chunkEvents<T>(events: T[], size: number) {
  if (events.length <= size) {
    return [events];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < events.length; i += size) {
    chunks.push(events.slice(i, i + size));
  }
  return chunks;
}
