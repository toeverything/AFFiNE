import serverNativeModule from '@affine/server-native';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

type NativeSafeFetchRequest = {
  url: string;
  headers?: Record<string, string>;
  allowedHeaders?: string[];
};

const test = ava.serial as TestFn<{
  requests: NativeSafeFetchRequest[];
}>;

function headerValue(
  headers: Record<string, string> | undefined,
  name: string
) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
}

test.before(t => {
  const requests: NativeSafeFetchRequest[] = [];

  Sinon.stub(serverNativeModule, 'safeFetch').callsFake(async request => {
    const nativeRequest = request as NativeSafeFetchRequest;
    requests.push(nativeRequest);
    return {
      status: 200,
      finalUrl: nativeRequest.url,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(
        JSON.stringify({
          access_token: 'github-access-token',
          scope: 'read:user user:email',
          token_type: 'bearer',
        })
      ),
    };
  });

  t.context.requests = requests;
});

test.after.always(() => {
  Sinon.restore();
});

test('github oauth token exchange should send a User-Agent header', async t => {
  const { OAuthProviderName } = await import('../../plugins/oauth/config');
  const { OAuthProvider } = await import('../../plugins/oauth/providers/def');

  class Probe extends OAuthProvider {
    override provider = OAuthProviderName.GitHub;

    getAuthUrl() {
      return '';
    }

    async getToken() {
      return { accessToken: 'token' };
    }

    async getUser() {
      return { id: 'id', email: 'user@example.com' };
    }

    exchange() {
      return this.postFormJson(
        'https://github.com/login/oauth/access_token',
        'code=oauth-code'
      );
    }
  }

  const { requests } = t.context;
  requests.length = 0;

  await new Probe().exchange();

  t.is(requests.length, 1);
  t.is(requests[0].url, 'https://github.com/login/oauth/access_token');
  t.truthy(headerValue(requests[0].headers, 'user-agent'));
  t.true(
    (requests[0].allowedHeaders ?? []).some(
      header => header.toLowerCase() === 'user-agent'
    )
  );
});
