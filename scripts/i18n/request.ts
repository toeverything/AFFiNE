// cSpell:ignore Tolgee
const TOLGEE_API_KEY = process.env['TOLGEE_API_KEY'];
const TOLGEE_API_URL = 'https://i18n.affine.pro';

if (!TOLGEE_API_KEY) {
  throw new Error(`Please set "TOLGEE_API_KEY" as environment variable!`);
}

const withTolgee = (
  fetch: typeof globalThis.fetch
): typeof globalThis.fetch => {
  const baseUrl = `${TOLGEE_API_URL}/v2/projects`;
  const headers = new Headers({
    'X-API-Key': TOLGEE_API_KEY,
    'Content-Type': 'application/json',
  });

  const isRequest = (input: RequestInfo | URL): input is Request => {
    return typeof input === 'object' && !('href' in input);
  };

  return new Proxy(fetch, {
    apply(
      target,
      thisArg: unknown,
      argArray: Parameters<typeof globalThis.fetch>
    ) {
      if (isRequest(argArray[0])) {
        // Request
        if (!argArray[0].headers) {
          argArray[0] = {
            ...argArray[0],
            url: `${baseUrl}${argArray[0].url}`,
            headers,
          };
        }
      } else {
        // URL or URLLike + ?RequestInit
        if (typeof argArray[0] === 'string') {
          argArray[0] = `${baseUrl}${argArray[0]}`;
        }
        if (!argArray[1]) {
          argArray[1] = {};
        }
        if (!argArray[1].headers) {
          argArray[1].headers = headers;
        }
      }
      // console.log('fetch', argArray);
      return target.apply(thisArg, argArray);
    },
  });
};

export const fetchTolgee = withTolgee(globalThis.fetch);
