import ky from 'ky-universal';
import { MessageCenter } from '../../../message/index.js';
import { token } from './token.js';

const messageCenter = MessageCenter.getInstance();

const _sendMessage = messageCenter.getMessageSender('affine');

export const bareClient = ky.extend({
  prefixUrl: 'http://localhost:8080',
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

    beforeError: [
      error => {
        const { response } = error;
        if (response.status === 401) {
          _sendMessage(MessageCenter.messageCode.noPermission);
        }
        return error;
      },
    ],
  },
});
