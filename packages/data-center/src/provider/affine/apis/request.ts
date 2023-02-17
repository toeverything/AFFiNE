import ky from 'ky-universal';

import { MessageCenter } from '../../../message';
import { GoogleAuth } from './google';

type KyInstance = typeof ky;

const messageCenter = MessageCenter.getInstance();

const _sendMessage = messageCenter.getMessageSender('affine');

export const createBareClient = (prefixUrl: string): KyInstance =>
  ky.extend({
    prefixUrl: prefixUrl,
    retry: 1,
    // todo: report timeout error
    timeout: 60000,
    hooks: {
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

const refreshTokenIfExpired = async (googleAuth: GoogleAuth) => {
  if (googleAuth.isLogin && googleAuth.isExpired) {
    try {
      await googleAuth.refreshToken();
    } catch (err) {
      return new Response('Unauthorized', { status: 401 });
    }
  }
};

export const createAuthClient = (
  bareClient: KyInstance,
  googleAuth: GoogleAuth
): KyInstance =>
  bareClient.extend({
    hooks: {
      beforeRequest: [
        async request => {
          if (googleAuth.isLogin) {
            await refreshTokenIfExpired(googleAuth);
            request.headers.set('Authorization', googleAuth.token);
          } else {
            return new Response('Unauthorized', { status: 401 });
          }
        },
      ],

      beforeRetry: [
        async ({ request }) => {
          await refreshTokenIfExpired(googleAuth);
          request.headers.set('Authorization', googleAuth.token);
        },
      ],
    },
  });
