import { Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import type { SendVerificationRequestParams } from 'next-auth/providers/email';

import { Config } from '../../../config';
import { SessionService } from '../../../session';
import { MailService } from '../mailer';

export async function sendVerificationRequest(
  config: Config,
  logger: Logger,
  mailer: MailService,
  session: SessionService,
  params: SendVerificationRequestParams
) {
  const { identifier, url, provider } = params;
  const urlWithToken = new URL(url);
  const callbackUrl = urlWithToken.searchParams.get('callbackUrl') || '';
  if (!callbackUrl) {
    throw new Error('callbackUrl is not set');
  } else {
    const newCallbackUrl = new URL(callbackUrl, config.origin);

    const token = nanoid();
    await session.set(token, identifier);
    newCallbackUrl.searchParams.set('token', token);

    urlWithToken.searchParams.set('callbackUrl', newCallbackUrl.toString());
  }

  const result = await mailer.sendSignInEmail(urlWithToken.toString(), {
    to: identifier,
    from: provider.from,
  });
  logger.log(`send verification email success: ${result.accepted.join(', ')}`);

  const failed = result.rejected.concat(result.pending).filter(Boolean);
  if (failed.length) {
    throw new Error(`Email (${failed.join(', ')}) could not be sent`);
  }
}
