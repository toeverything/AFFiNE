import ky from 'ky-universal';
import { MessageCenter } from '../../../message';
import { auth } from './auth';

type KyInstance = typeof ky;

const messageCenter = MessageCenter.getInstance();

const _sendMessage = messageCenter.getMessageSender('affine');

export const bareClient: KyInstance = ky.extend({
  prefixUrl: '/',
  retry: 1,
  // todo: report timeout error
  timeout: 60000,
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

const refreshTokenIfExpired = async () => {
  if (auth.isLogin && auth.isExpired) {
    try {
      await auth.refreshToken();
    } catch (err) {
      return new Response('Unauthorized', { status: 401 });
    }
  }
};

export const client: KyInstance = bareClient.extend({
  hooks: {
    beforeRequest: [
      async request => {
        if (auth.isLogin) {
          await refreshTokenIfExpired();
          request.headers.set('Authorization', auth.token);
        } else {
          return new Response('Unauthorized', { status: 401 });
        }
      },
    ],

    beforeRetry: [
      async ({ request }) => {
        await refreshTokenIfExpired();
        request.headers.set('Authorization', auth.token);
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
