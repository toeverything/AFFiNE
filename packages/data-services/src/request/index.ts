import ky from 'ky';
import {
  getToken,
  setToken,
  isAccessTokenExpired,
  refreshToken,
  authorizationEvent,
} from './token';

export const request = ky.extend({
  retry: 1,
  hooks: {
    beforeRequest: [
      async request => {
        if (!request.headers.has('token') || request.headers.get('token')) {
          const token = getToken();
          if (token) {
            if (isAccessTokenExpired(token.accessToken)) {
              await refreshToken();
            }

            request.headers.set('Authorization', token.accessToken);
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
        const token = await refreshToken();
        request.headers.set('Authorization', token.accessToken);
      },
    ],
  },
});

export type { AccessTokenMessage } from './token';
export { authorizationEvent, getToken, setToken };
