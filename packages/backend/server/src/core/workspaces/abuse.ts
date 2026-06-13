const URL_OR_DOMAIN_PATTERN =
  /(?:https?:\/\/|www\.|(?<![@\w-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?=$|[^\p{L}\p{N}._-]))/iu;

export function containsUrlOrDomain(value: string | null | undefined) {
  return URL_OR_DOMAIN_PATTERN.test(value ?? '');
}

export function canUserExecuteLimitedActions(
  user: { createdAt: Date },
  minimumAccountAgeMs: number
) {
  if (minimumAccountAgeMs <= 0) return true;
  return Date.now() - user.createdAt.getTime() >= minimumAccountAgeMs;
}
