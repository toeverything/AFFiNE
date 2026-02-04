import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { escape } from 'lodash-es';

import {
  assertSsrFSafeUrl,
  CalendarProviderRequestError,
  GraphqlBadRequest,
  SsrfBlockedError,
} from '../../../base';
import type {
  CalendarCalDAVAuthType,
  CalendarCalDAVProviderPreset,
} from '../config';
import {
  CalendarProvider,
  CalendarProviderCalendar,
  CalendarProviderEvent,
  CalendarProviderEventTime,
  CalendarProviderListCalendarsParams,
  CalendarProviderListEventsParams,
  CalendarProviderListEventsResult,
  CalendarProviderName,
} from './def';
import { CalendarSyncTokenInvalid } from './google';

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  textNodeName: 'text',
});

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;
const CALDAV_ALLOWED_PROTOCOLS = new Set(['https:']);
const CALDAV_ALLOWED_PROTOCOLS_INSECURE = new Set(['http:', 'https:']);

type CalDAVCredentials = {
  username: string;
  password: string;
};

type CalDAVDiscoveryResult = {
  providerAccountId: string;
  serverUrl: string;
  principalUrl: string;
  calendarHomeUrl: string;
  authType?: CalendarCalDAVAuthType | null;
};

type DigestChallenge = {
  realm?: string;
  nonce?: string;
  qop?: string;
  algorithm?: string;
  opaque?: string;
};

const toArray = <T>(value?: T | T[]): T[] => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const readText = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'text' in value) {
    return String((value as { text?: unknown }).text ?? '');
  }
  return null;
};

const parseStatusCode = (value: unknown): number | null => {
  const text = readText(value ?? null) ?? (value ? String(value) : null);
  if (!text) {
    return null;
  }
  const match = text.match(/\s(\d{3})\s/);
  return match ? Number(match[1]) : null;
};

const resolveHref = (href: string, baseUrl: string) => {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
};

const formatUtcForIcal = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    String(date.getUTCFullYear()),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('');
};

const isRedirectStatus = (status: number) =>
  [301, 302, 303, 307, 308].includes(status);

const splitHeaderTokens = (value: string) =>
  value
    .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
    .map(token => token.trim())
    .filter(Boolean);

const parseDigestChallenge = (
  header: string | null
): DigestChallenge | null => {
  if (!header) {
    return null;
  }
  const digestMatch = header.match(/Digest\s+(.+)/i);
  if (!digestMatch) {
    return null;
  }
  const params: Record<string, string> = {};
  for (const part of splitHeaderTokens(digestMatch[1])) {
    const [key, ...rest] = part.split('=');
    if (!key) {
      continue;
    }
    const rawValue = rest.join('=').trim();
    const value = rawValue.replace(/^"|"$/g, '');
    params[key.toLowerCase()] = value;
  }
  return {
    realm: params.realm,
    nonce: params.nonce,
    qop: params.qop,
    algorithm: params.algorithm,
    opaque: params.opaque,
  };
};

const hashString = (algorithm: string, value: string) =>
  createHash(algorithm).update(value).digest('hex');

const buildDigestAuthHeader = (params: {
  challenge: DigestChallenge;
  method: string;
  uri: string;
  username: string;
  password: string;
  nonceCount: number;
}) => {
  const realm = params.challenge.realm ?? '';
  const nonce = params.challenge.nonce ?? '';
  const algorithmRaw = params.challenge.algorithm?.toLowerCase() ?? 'md5';
  const isSess = algorithmRaw.endsWith('-sess');
  const algorithm = algorithmRaw.startsWith('sha-256') ? 'sha256' : 'md5';
  const qopValues = params.challenge.qop
    ? params.challenge.qop.split(',').map(item => item.trim())
    : [];
  const qop = qopValues.includes('auth') ? 'auth' : qopValues[0];
  const cnonce = randomBytes(8).toString('hex');
  const nc = String(params.nonceCount).padStart(8, '0');

  const ha1Raw = `${params.username}:${realm}:${params.password}`;
  const ha1 = isSess
    ? hashString(
        algorithm,
        `${hashString(algorithm, ha1Raw)}:${nonce}:${cnonce}`
      )
    : hashString(algorithm, ha1Raw);
  const ha2 = hashString(algorithm, `${params.method}:${params.uri}`);

  const response = qop
    ? hashString(algorithm, `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : hashString(algorithm, `${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${params.username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${params.uri}"`,
    `response="${response}"`,
  ];

  if (params.challenge.opaque) {
    parts.push(`opaque="${params.challenge.opaque}"`);
  }
  if (params.challenge.algorithm) {
    parts.push(`algorithm=${params.challenge.algorithm}`);
  }
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }

  return `Digest ${parts.join(', ')}`;
};

const unescapeIcalText = (value: string) =>
  value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');

const unfoldIcalLines = (content: string) => {
  const lines = content.split(/\r\n|\n|\r/);
  const unfolded: string[] = [];
  for (const line of lines) {
    if (!line) {
      continue;
    }
    if (line.startsWith(' ') || line.startsWith('\t')) {
      const prev = unfolded.pop() ?? '';
      unfolded.push(prev + line.slice(1));
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
};

const parseIcalDate = (value: string) => {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const parseIcalDateTime = (value: string) => {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/
  );
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second, suffix] = match;
  const date = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  if (suffix === 'Z') {
    return new Date(`${date}Z`);
  }
  if (suffix && suffix !== 'Z') {
    const offset = `${suffix.slice(0, 3)}:${suffix.slice(3)}`;
    return new Date(`${date}${offset}`);
  }
  return { date, naive: true } as const;
};

const getTimeZoneOffset = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => {
    const part = parts.find(item => item.type === type);
    return part ? Number(part.value) : 0;
  };
  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    lookup('hour'),
    lookup('minute'),
    lookup('second')
  );
  return (asUtc - date.getTime()) / 60000;
};

const zonedTimeToUtc = (value: string, timeZone: string) => {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  const utcGuess = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );
  const offsetMinutes = getTimeZoneOffset(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
};

const parseIcalTime = (value: string, tzid?: string) => {
  if (value.length === 8 && /^\d{8}$/.test(value)) {
    const date = parseIcalDate(value);
    return date
      ? ({
          date,
          timeZone: tzid,
        } satisfies CalendarProviderEventTime)
      : null;
  }

  const parsed = parseIcalDateTime(value);
  if (!parsed) {
    return null;
  }

  if (parsed instanceof Date) {
    return {
      dateTime: parsed.toISOString(),
      timeZone: tzid,
    } satisfies CalendarProviderEventTime;
  }

  if (parsed.naive && tzid) {
    const utcDate = zonedTimeToUtc(parsed.date.replace(/[-:]/g, ''), tzid);
    if (utcDate) {
      return {
        dateTime: utcDate.toISOString(),
        timeZone: tzid,
      } satisfies CalendarProviderEventTime;
    }
  }

  return {
    dateTime: `${parsed.date}Z`,
    timeZone: tzid,
  } satisfies CalendarProviderEventTime;
};

const parseIcalEvents = (params: {
  ical: string;
  href: string;
  etag?: string | null;
}) => {
  const events: CalendarProviderEvent[] = [];
  const lines = unfoldIcalLines(params.ical);
  let current: {
    props: Map<
      string,
      Array<{ value: string; params: Record<string, string> }>
    >;
  } | null = null;

  const pushProp = (
    name: string,
    value: string,
    rawParams: Record<string, string>
  ) => {
    if (!current) {
      return;
    }
    const key = name.toUpperCase();
    const params = Object.fromEntries(
      Object.entries(rawParams).map(([paramKey, paramValue]) => [
        paramKey.toUpperCase(),
        paramValue,
      ])
    );
    const list = current.props.get(key) ?? [];
    list.push({ value, params });
    current.props.set(key, list);
  };

  const readProp = (name: string) => {
    if (!current) {
      return null;
    }
    return current.props.get(name.toUpperCase())?.[0] ?? null;
  };

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = { props: new Map() };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (!current) {
        continue;
      }
      const uid = readProp('UID')?.value ?? params.href;
      const summary = readProp('SUMMARY')?.value;
      const description = readProp('DESCRIPTION')?.value;
      const location = readProp('LOCATION')?.value;
      const status = readProp('STATUS')?.value?.toLowerCase();
      const dtstart = readProp('DTSTART');
      const dtend = readProp('DTEND');
      const recurrenceId = readProp('RECURRENCE-ID');
      const lastModified = readProp('LAST-MODIFIED') ?? readProp('DTSTAMP');

      const start = dtstart
        ? parseIcalTime(dtstart.value, dtstart.params.TZID)
        : null;
      const end = dtend ? parseIcalTime(dtend.value, dtend.params.TZID) : start;
      const originalStartTime = recurrenceId
        ? parseIcalTime(recurrenceId.value, recurrenceId.params.TZID)
        : undefined;
      const updated = lastModified
        ? parseIcalDateTime(lastModified.value)
        : null;

      if (start && end) {
        events.push({
          id: params.href,
          status: status ?? undefined,
          etag: params.etag ?? undefined,
          summary: summary ? unescapeIcalText(summary) : undefined,
          description: description ? unescapeIcalText(description) : undefined,
          location: location ? unescapeIcalText(location) : undefined,
          updated:
            updated && updated instanceof Date
              ? updated.toISOString()
              : updated && 'date' in updated
                ? `${updated.date}Z`
                : undefined,
          recurringEventId: uid,
          originalStartTime: originalStartTime ?? undefined,
          start,
          end,
          raw: {
            ical: params.ical,
            href: params.href,
            etag: params.etag ?? undefined,
            uid,
          },
        });
      }
      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const namePart = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    const [rawName, ...paramParts] = namePart.split(';');
    const lineParams = paramParts.reduce<Record<string, string>>(
      (acc, part) => {
        const [key, ...rest] = part.split('=');
        if (!key) {
          return acc;
        }
        acc[key] = rest.join('=');
        return acc;
      },
      {}
    );

    pushProp(rawName, value, lineParams);
  }

  return events;
};

const extractCalendarTimezone = (value: unknown) => {
  const text = readText(value ?? null);
  if (!text) {
    return undefined;
  }
  const match = text.match(/TZID:([^\r\n]+)/);
  return match ? match[1].trim() : undefined;
};

const hasCalendarResourceType = (value: unknown): boolean => {
  if (!value) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(item => hasCalendarResourceType(item));
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'calendar';
  }
  if (typeof value === 'object') {
    return 'calendar' in value;
  }
  return false;
};

const isAllowedHost = (host: string, allowedHosts: string[]) => {
  const normalizedHost = host.toLowerCase();
  return allowedHosts.some(entry => {
    const normalized = entry.toLowerCase();
    if (!normalized) {
      return false;
    }
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(2);
      return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
    }
    return (
      normalizedHost === normalized || normalizedHost.endsWith(`.${normalized}`)
    );
  });
};

class CalDAVRequestPolicy {
  constructor(private readonly config: { calendar: { caldav: any } }) {}

  private get allowInsecureHttp() {
    return this.config.calendar.caldav.allowInsecureHttp ?? false;
  }

  private get allowedHosts() {
    return this.config.calendar.caldav.allowedHosts ?? [];
  }

  private get blockPrivateNetwork() {
    return this.config.calendar.caldav.blockPrivateNetwork ?? true;
  }

  private get timeoutMs() {
    return (
      this.config.calendar.caldav.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    );
  }

  private get maxRedirects() {
    return this.config.calendar.caldav.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  }

  async fetch(
    url: string,
    init: RequestInit,
    redirects = 0
  ): Promise<Response> {
    await this.assertAllowedUrl(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        if (redirects >= this.maxRedirects) {
          throw new GraphqlBadRequest({
            code: 'caldav_max_redirects',
            message: 'CalDAV request exceeded redirect limit.',
          });
        }
        const nextUrl = resolveHref(location, url);
        return this.fetch(nextUrl, init, redirects + 1);
      }
    }

    return response;
  }

  private async assertAllowedUrl(urlValue: string) {
    let url: URL;
    try {
      url = new URL(urlValue);
    } catch {
      throw new GraphqlBadRequest({
        code: 'caldav_invalid_url',
        message: 'CalDAV URL is invalid.',
      });
    }

    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && this.allowInsecureHttp)
    ) {
      throw new GraphqlBadRequest({
        code: 'caldav_insecure_url',
        message: 'CalDAV URL must use https.',
      });
    }

    const hostname = url.hostname.toLowerCase();
    if (
      this.allowedHosts.length &&
      !isAllowedHost(hostname, this.allowedHosts)
    ) {
      throw new GraphqlBadRequest({
        code: 'caldav_host_blocked',
        message: 'CalDAV host is not allowed.',
      });
    }

    if (!this.blockPrivateNetwork) {
      return;
    }

    try {
      await assertSsrFSafeUrl(url, {
        allowedProtocols: this.allowInsecureHttp
          ? CALDAV_ALLOWED_PROTOCOLS_INSECURE
          : CALDAV_ALLOWED_PROTOCOLS,
      });
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        const reason = String(error.data?.reason ?? '');

        if (reason === 'blocked_ip') {
          throw new GraphqlBadRequest({
            code: 'caldav_private_network',
            message: 'CalDAV host is in a private network.',
          });
        }

        if (reason === 'unresolvable_hostname') {
          throw new GraphqlBadRequest({
            code: 'caldav_dns_failed',
            message: 'Unable to resolve CalDAV host.',
          });
        }

        if (reason === 'disallowed_protocol') {
          throw new GraphqlBadRequest({
            code: 'caldav_insecure_url',
            message: 'CalDAV URL must use https.',
          });
        }

        if (
          reason === 'invalid_url' ||
          reason === 'blocked_hostname' ||
          reason === 'url_has_credentials'
        ) {
          throw new GraphqlBadRequest({
            code: 'caldav_invalid_url',
            message: 'CalDAV URL is invalid.',
          });
        }
      }

      throw error;
    }
  }
}

class CalDAVClient {
  private nonceCount = 1;
  private resolvedAuthType?: CalendarCalDAVAuthType;

  constructor(
    private readonly policy: CalDAVRequestPolicy,
    private readonly credentials: CalDAVCredentials,
    private readonly preferredAuthType: CalendarCalDAVAuthType
  ) {}

  get authType() {
    return this.resolvedAuthType ?? this.preferredAuthType;
  }

  async request(url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has('Authorization')) {
      if (this.preferredAuthType === 'digest') {
        return this.requestDigest(url, init);
      }
      const authType =
        this.preferredAuthType === 'auto' ? 'basic' : this.preferredAuthType;
      if (authType === 'basic') {
        headers.set(
          'Authorization',
          `Basic ${Buffer.from(
            `${this.credentials.username}:${this.credentials.password}`
          ).toString('base64')}`
        );
      }
      const response = await this.policy.fetch(url, { ...init, headers });
      if (response.status === 401 && this.preferredAuthType === 'auto') {
        const challenge = parseDigestChallenge(
          response.headers.get('www-authenticate')
        );
        if (challenge?.nonce) {
          return this.retryDigest(url, init, challenge);
        }
      }
      if (response.ok) {
        this.resolvedAuthType = authType;
      }
      return response;
    }

    return this.policy.fetch(url, init);
  }

  async requestDigest(url: string, init: RequestInit): Promise<Response> {
    const response = await this.policy.fetch(url, init);
    if (response.status !== 401) {
      if (response.ok) {
        this.resolvedAuthType = 'digest';
      }
      return response;
    }

    const challenge = parseDigestChallenge(
      response.headers.get('www-authenticate')
    );
    if (!challenge?.nonce) {
      return response;
    }

    return this.retryDigest(url, init, challenge);
  }

  private async retryDigest(
    url: string,
    init: RequestInit,
    challenge: DigestChallenge
  ) {
    const target = new URL(url);
    const uri = `${target.pathname}${target.search}`;
    const header = buildDigestAuthHeader({
      challenge,
      method: init.method ?? 'GET',
      uri,
      username: this.credentials.username,
      password: this.credentials.password,
      nonceCount: this.nonceCount++,
    });

    const headers = new Headers(init.headers);
    headers.set('Authorization', header);
    const response = await this.policy.fetch(url, { ...init, headers });
    if (response.ok) {
      this.resolvedAuthType = 'digest';
    }
    return response;
  }
}

const parseMultistatus = (xml: string) => {
  const parsed = XML_PARSER.parse(xml);
  const multistatus = parsed.multistatus ?? parsed['D:multistatus'] ?? parsed;
  const responses = toArray(multistatus?.response);
  const syncToken = readText(multistatus?.['sync-token']) ?? undefined;
  return { responses, syncToken };
};

const extractHrefValue = (value: unknown, baseUrl: string) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return resolveHref(value, baseUrl);
  }
  if (Array.isArray(value)) {
    const first = value.find(item => readText(item));
    const href = readText(first);
    return href ? resolveHref(href, baseUrl) : null;
  }
  if (typeof value === 'object' && 'href' in (value as object)) {
    const href = readText((value as { href?: unknown }).href ?? null);
    return href ? resolveHref(href, baseUrl) : null;
  }
  const text = readText(value);
  return text ? resolveHref(text, baseUrl) : null;
};

const getPropstat = (response: any) => {
  const propstats = toArray(response?.propstat);
  if (!propstats.length) {
    return null;
  }
  for (const propstat of propstats) {
    const statusCode = parseStatusCode(propstat.status);
    if (!statusCode || (statusCode >= 200 && statusCode < 300)) {
      return propstat.prop ?? null;
    }
  }
  return propstats[0]?.prop ?? null;
};

const isNotFoundResponse = (response: any) => {
  const statusCode = parseStatusCode(response?.status);
  if (statusCode === 404) {
    return true;
  }
  const propstats = toArray(response?.propstat);
  return propstats.some(propstat => parseStatusCode(propstat.status) === 404);
};

@Injectable()
export class CalDAVProvider extends CalendarProvider {
  override provider = CalendarProviderName.CalDAV;

  override get configured() {
    return !!this.config?.enabled && !!this.config?.providers?.length;
  }

  override get supportsOAuth() {
    return false;
  }

  override watchCalendar = undefined;
  override stopChannel = undefined;

  override getAuthUrl(): string {
    throw new GraphqlBadRequest({
      code: 'caldav_oauth_unsupported',
      message: 'CalDAV does not support OAuth authorization.',
    });
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  override async exchangeCode(): Promise<any> {
    throw new GraphqlBadRequest({
      code: 'caldav_oauth_unsupported',
      message: 'CalDAV does not support OAuth authorization.',
    });
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  override async refreshTokens(): Promise<any> {
    throw new GraphqlBadRequest({
      code: 'caldav_oauth_unsupported',
      message: 'CalDAV does not support OAuth authorization.',
    });
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  override async getAccountProfile(): Promise<any> {
    throw new GraphqlBadRequest({
      code: 'caldav_oauth_unsupported',
      message: 'CalDAV does not support OAuth authorization.',
    });
  }

  async discoverAccount(params: {
    preset: CalendarCalDAVProviderPreset;
    username: string;
    password: string;
  }): Promise<CalDAVDiscoveryResult> {
    const policy = new CalDAVRequestPolicy({
      calendar: { caldav: this.config },
    });
    const client = new CalDAVClient(
      policy,
      { username: params.username, password: params.password },
      params.preset.authType ?? 'auto'
    );

    const discoveryUrl = await this.resolveDiscoveryUrl(
      client,
      params.preset.serverUrl
    );
    const principalUrl = await this.fetchCurrentUserPrincipal(
      client,
      discoveryUrl
    );
    const calendarHomeUrl = await this.fetchCalendarHomeSet(
      client,
      principalUrl,
      discoveryUrl
    );
    const providerAccountId =
      principalUrl || `${params.username}@${new URL(discoveryUrl).hostname}`;

    return {
      providerAccountId,
      serverUrl: discoveryUrl,
      principalUrl,
      calendarHomeUrl,
      authType: client.authType === 'auto' ? null : client.authType,
    };
  }

  override async listCalendars(
    params: CalendarProviderListCalendarsParams
  ): Promise<CalendarProviderCalendar[]> {
    if (!params.account?.calendarHomeUrl) {
      throw new GraphqlBadRequest({
        code: 'caldav_account_missing',
        message: 'CalDAV account metadata is missing.',
      });
    }

    const policy = new CalDAVRequestPolicy({
      calendar: { caldav: this.config },
    });
    const client = new CalDAVClient(
      policy,
      {
        username: params.account.username ?? params.account.email ?? '',
        password: params.accessToken,
      },
      (params.account.authType as CalendarCalDAVAuthType) ?? 'auto'
    );

    const url = resolveHref(
      params.account.calendarHomeUrl,
      params.account.serverUrl ?? params.account.calendarHomeUrl
    );

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:IC="http://apple.com/ns/ical/">
  <D:prop>
    <D:displayname />
    <D:resourcetype />
    <C:calendar-timezone />
    <IC:calendar-color />
  </D:prop>
</D:propfind>`;

    const response = await client.request(url, {
      method: 'PROPFIND',
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new CalendarProviderRequestError({
        status: response.status,
        message: text,
      });
    }

    const { responses } = parseMultistatus(text);
    const calendars: CalendarProviderCalendar[] = [];
    for (const item of responses) {
      const href = readText(item.href ?? null);
      if (!href) {
        continue;
      }
      const prop = getPropstat(item);
      const resourcetype = prop?.resourcetype;
      if (!hasCalendarResourceType(resourcetype)) {
        continue;
      }
      calendars.push({
        id: resolveHref(href, url),
        summary: readText(prop?.displayname ?? null) ?? undefined,
        timeZone:
          extractCalendarTimezone(prop?.['calendar-timezone']) ?? undefined,
        colorId: readText(prop?.['calendar-color'] ?? null) ?? undefined,
      });
    }

    return calendars;
  }

  override async listEvents(
    params: CalendarProviderListEventsParams
  ): Promise<CalendarProviderListEventsResult> {
    if (!params.account?.serverUrl) {
      throw new GraphqlBadRequest({
        code: 'caldav_account_missing',
        message: 'CalDAV account metadata is missing.',
      });
    }

    const policy = new CalDAVRequestPolicy({
      calendar: { caldav: this.config },
    });
    const client = new CalDAVClient(
      policy,
      {
        username: params.account.username ?? params.account.email ?? '',
        password: params.accessToken,
      },
      (params.account.authType as CalendarCalDAVAuthType) ?? 'auto'
    );

    const calendarUrl = resolveHref(
      params.calendarId,
      params.account.serverUrl
    );

    if (params.syncToken) {
      try {
        return await this.syncCollection(client, calendarUrl, params.syncToken);
      } catch (error) {
        if (error instanceof CalendarProviderRequestError) {
          const status = error.data?.status ?? error.status;
          if (this.shouldResetSyncToken(status)) {
            throw new CalendarSyncTokenInvalid(error.message);
          }
        }
        throw error;
      }
    }

    return await this.calendarQuery(
      client,
      calendarUrl,
      params.timeMin,
      params.timeMax
    );
  }

  private shouldResetSyncToken(status: number) {
    return [403, 404, 409, 410, 501].includes(status);
  }

  private async resolveDiscoveryUrl(client: CalDAVClient, serverUrl: string) {
    const wellKnownUrl = new URL('/.well-known/caldav', serverUrl).toString();
    const response = await client.request(wellKnownUrl, { method: 'GET' });
    if (response.ok) {
      return response.url;
    }
    if ([404, 405].includes(response.status)) {
      return serverUrl;
    }
    const text = await response.text();
    throw new CalendarProviderRequestError({
      status: response.status,
      message: text,
    });
  }

  private async fetchCurrentUserPrincipal(
    client: CalDAVClient,
    baseUrl: string
  ) {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal />
  </D:prop>
</D:propfind>`;

    const response = await client.request(baseUrl, {
      method: 'PROPFIND',
      headers: {
        Depth: '0',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new CalendarProviderRequestError({
        status: response.status,
        message: text,
      });
    }

    const { responses } = parseMultistatus(text);
    const first = responses[0];
    const prop = getPropstat(first);
    const principal = extractHrefValue(
      prop?.['current-user-principal'] ?? prop?.['principal-url'],
      baseUrl
    );
    if (!principal) {
      throw new CalendarProviderRequestError({
        status: 500,
        message: 'CalDAV principal not found.',
      });
    }
    return principal;
  }

  private async fetchCalendarHomeSet(
    client: CalDAVClient,
    principalUrl: string,
    baseUrl: string
  ) {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set />
  </D:prop>
</D:propfind>`;

    const response = await client.request(principalUrl, {
      method: 'PROPFIND',
      headers: {
        Depth: '0',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new CalendarProviderRequestError({
        status: response.status,
        message: text,
      });
    }

    const { responses } = parseMultistatus(text);
    const first = responses[0];
    const prop = getPropstat(first);
    const home = extractHrefValue(prop?.['calendar-home-set'], baseUrl);
    if (!home) {
      throw new CalendarProviderRequestError({
        status: 500,
        message: 'CalDAV calendar home not found.',
      });
    }
    return home;
  }

  private async syncCollection(
    client: CalDAVClient,
    calendarUrl: string,
    syncToken: string
  ): Promise<CalendarProviderListEventsResult> {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<D:sync-collection xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:sync-token>${escape(syncToken)}</D:sync-token>
  <D:sync-level>1</D:sync-level>
  <D:prop>
    <D:getetag />
    <C:calendar-data />
  </D:prop>
</D:sync-collection>`;

    const response = await client.request(calendarUrl, {
      method: 'REPORT',
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new CalendarProviderRequestError({
        status: response.status,
        message: text,
      });
    }

    const { responses, syncToken: nextSyncToken } = parseMultistatus(text);
    const events: CalendarProviderEvent[] = [];

    for (const item of responses) {
      const href = readText(item.href ?? null);
      if (!href) {
        continue;
      }
      if (isNotFoundResponse(item)) {
        events.push({
          id: resolveHref(href, calendarUrl),
          status: 'cancelled',
          start: { dateTime: new Date(0).toISOString() },
          end: { dateTime: new Date(0).toISOString() },
          raw: { href },
        });
        continue;
      }

      const prop = getPropstat(item);
      const calendarData = readText(prop?.['calendar-data'] ?? null);
      if (!calendarData) {
        continue;
      }
      const etag = readText(prop?.getetag ?? null);
      events.push(
        ...parseIcalEvents({
          ical: calendarData,
          href: resolveHref(href, calendarUrl),
          etag,
        })
      );
    }

    return { events, nextSyncToken };
  }

  private async calendarQuery(
    client: CalDAVClient,
    calendarUrl: string,
    timeMin?: string,
    timeMax?: string
  ): Promise<CalendarProviderListEventsResult> {
    const timeRange =
      timeMin && timeMax
        ? `<C:time-range start="${formatUtcForIcal(timeMin)}" end="${formatUtcForIcal(timeMax)}" />`
        : '';

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag />
    <C:calendar-data />
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        ${timeRange}
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    const response = await client.request(calendarUrl, {
      method: 'REPORT',
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new CalendarProviderRequestError({
        status: response.status,
        message: text,
      });
    }

    const { responses } = parseMultistatus(text);
    const events: CalendarProviderEvent[] = [];

    for (const item of responses) {
      const href = readText(item.href ?? null);
      if (!href) {
        continue;
      }
      const prop = getPropstat(item);
      const calendarData = readText(prop?.['calendar-data'] ?? null);
      if (!calendarData) {
        continue;
      }
      const etag = readText(prop?.getetag ?? null);
      events.push(
        ...parseIcalEvents({
          ical: calendarData,
          href: resolveHref(href, calendarUrl),
          etag,
        })
      );
    }

    return { events };
  }
}
