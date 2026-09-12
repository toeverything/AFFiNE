import type { LightMyRequestResponse } from 'fastify';

export function cookieHeader(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map(entry => entry.split(';')[0])
    .filter((part): part is string => Boolean(part))
    .join('; ');
}
