import ky from 'ky';
import { token } from './token';

export const request = ky.extend({
  retry: 1,
  hooks: {
    beforeRequest: [
      async request => {
        if (!request.headers.has('token') || request.headers.get('token')) {
          if (token.isLogin) {
            if (token.isExpired) await token.refreshToken();
            request.headers.set('Authorization', token.token);
          }
        }
      },
    ],
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
