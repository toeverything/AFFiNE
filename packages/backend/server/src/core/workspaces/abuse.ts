export const SHARE_ACTION_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

const URL_OR_DOMAIN_PATTERN =
  /(?:https?:\/\/|www\.|(?<![@\w-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?=$|[^\p{L}\p{N}._-]))/iu;

export function containsUrlOrDomain(value: string | null | undefined) {
  return URL_OR_DOMAIN_PATTERN.test(value ?? '');
}

export function isUserOldEnoughForShareActions(user: { createdAt: Date }) {
  return Date.now() - user.createdAt.getTime() >= SHARE_ACTION_ACCOUNT_AGE_MS;
}
