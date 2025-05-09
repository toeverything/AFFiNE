import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';

import { BadRequest } from '../../base';
import { Renderers } from '../../mails';
import { CurrentUser } from '../auth/session';
import { Admin } from '../common';
import { MailSender } from './sender';

@Admin()
@Resolver(() => Boolean)
export class MailResolver {
  @Mutation(() => Boolean)
  async sendTestEmail(
    @CurrentUser() user: CurrentUser,
    @Args('config', { type: () => GraphQLJSONObject })
    config: AppConfig['mailer']['SMTP']
  ) {
    const smtp = MailSender.create(config);

    using _disposable = {
      [Symbol.dispose]: () => {
        smtp.close();
      },
    };

    try {
      await smtp.verify();
    } catch (e) {
      throw new BadRequest(
        `Failed to verify your SMTP configuration. Cause: ${(e as Error).message}`
      );
    }

    try {
      await smtp.sendMail({
        from: config.sender,
        to: user.email,
        ...(await Renderers.TestMail({})),
      });
    } catch (e) {
      throw new BadRequest(
        `Failed to send test email. Cause: ${(e as Error).message}`
      );
    }

    return true;
  }
}
