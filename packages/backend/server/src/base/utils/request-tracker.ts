import type { Request } from 'express';

function firstForwardedForIp(value?: string) {
  if (!value) {
    return;
  }

  const [first] = value.split(',', 1);
  const ip = first?.trim();

  return ip || undefined;
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return;
}

export function getRequestClientIp(req: Request) {
  return firstNonEmpty(
    req.get('CF-Connecting-IP'),
    firstForwardedForIp(req.get('X-Forwarded-For')),
    req.get('X-Real-IP'),
    req.ip
  )!;
}

export function getRequestTrackerId(req: Request) {
  return (
    req.session?.sessionId ??
    firstNonEmpty(
      req.get('CF-Connecting-IP'),
      firstForwardedForIp(req.get('X-Forwarded-For')),
      req.get('X-Real-IP'),
      req.get('CF-Ray'),
      req.ip
    )!
  );
}
