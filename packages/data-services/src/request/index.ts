import ky from 'ky';
import { token } from './token';

export const bareClient = ky.extend({
  retry: 1,
  hooks: {
    // afterResponse: [
    //   async (_request, _options, response) => {
    //     if (response.status === 200) {
    //       const data = await response.json();
    //       if (data.error) {
    //         return new Response(data.error.message, {
    //           status: data.error.code,
    //         });
    //       }
    //     }
    //     return response;
    //   },
    // ],
  },
});
export const client = bareClient.extend({
  hooks: {
    beforeRequest: [
      async request => {
        if (token.isLogin) {
          if (token.isExpired) await token.refreshToken();
          request.headers.set('Authorization', token.token);
        } else {
          return new Response('Unauthorized', { status: 401 });
        }
      },
    ],

    beforeRetry: [
      async ({ request }) => {
        await token.refreshToken();
        request.headers.set('Authorization', token.token);
      },
    ],
  },
});

export type { AccessTokenMessage } from './token';
export { token };
