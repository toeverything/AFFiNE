import { scanContentPolicyV1 } from '../native';

export function scanContentPolicy(value: string | null | undefined) {
  return scanContentPolicyV1({
    value: value ?? '',
    checks: ['url_or_domain'],
  });
}

export function containsUrlOrDomain(value: string | null | undefined) {
  return scanContentPolicy(value).matches.some(
    match => match.type === 'url_or_domain'
  );
}
