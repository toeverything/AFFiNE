import { resolveMx, resolveTxt } from 'node:dns/promises';

const EMAIL_DOMAIN_DNS_TIMEOUT_MS = 2_000;

type DomainLookups = {
  resolveMx: typeof resolveMx;
  resolveTxt: typeof resolveTxt;
};

const defaultLookups: DomainLookups = {
  resolveMx,
  resolveTxt,
};

function joinTxtRecords(records: string[][]) {
  return records.map(record => record.join(''));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('DNS lookup timed out')),
      timeoutMs
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function verifyEmailDomainRecords(
  email: string,
  lookups: DomainLookups = defaultLookups,
  timeoutMs = EMAIL_DOMAIN_DNS_TIMEOUT_MS
) {
  const [name, domain, ...rest] = email.split('@');
  if (rest.length || !domain || name.includes('+')) {
    return false;
  }

  const [mx, spf, dmarc] = await Promise.allSettled([
    withTimeout(
      lookups
        .resolveMx(domain)
        .then(records => records.map(mx => mx.exchange).filter(Boolean)),
      timeoutMs
    ),
    withTimeout(
      lookups
        .resolveTxt(domain)
        .then(records =>
          joinTxtRecords(records).filter(txt => txt.includes('v=spf1'))
        ),
      timeoutMs
    ),
    withTimeout(
      lookups
        .resolveTxt('_dmarc.' + domain)
        .then(records =>
          joinTxtRecords(records).filter(txt => txt.includes('v=DMARC1'))
        ),
      timeoutMs
    ),
  ]).then(results =>
    results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value)
  );

  return !!mx?.length && !!spf?.length && !!dmarc?.length;
}
