import Sinon from 'sinon';

import { Mailer } from '../../core/mail';
import { MailName } from '../../mails';

export class MockMailer {
  send = Sinon.createStubInstance(Mailer).send.resolves(true);

  last<Mail extends MailName>(
    name: Mail
  ): Extract<Jobs['notification.sendMail'], { name: Mail }> {
    const last = this.send.lastCall.args[0];

    if (!last) {
      throw new Error('No mail ever sent');
    }

    if (last.name !== name) {
      throw new Error(`Mail name mismatch: ${last.name} !== ${name}`);
    }

    return last as any;
  }

  count(name: MailName) {
    return this.send.getCalls().filter(call => call.args[0].name === name)
      .length;
  }
}
