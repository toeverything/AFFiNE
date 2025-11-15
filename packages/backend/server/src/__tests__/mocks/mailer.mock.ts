import { interval, map, take, takeUntil } from 'rxjs';
import Sinon from 'sinon';

import { Mailer } from '../../core/mail';
import { MailName } from '../../mails';

export class MockMailer {
  send = Sinon.createStubInstance(Mailer).send.resolves(true);
  trySend(command: Jobs['notification.sendMail']) {
    return this.send(command, true);
  }

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

  waitFor<Mail extends MailName>(
    name: Mail,
    timeout: number = 1000
  ): Promise<Extract<Jobs['notification.sendMail'], { name: Mail }>> {
    const { promise, reject, resolve } = Promise.withResolvers<any>();

    interval(10)
      .pipe(
        take(Math.floor(timeout / 10)),
        takeUntil(promise),
        map(() => {
          const last = this.send.lastCall.args[0];
          return last.name === name ? last : undefined;
        })
      )
      .subscribe({
        next: val => {
          if (val) {
            resolve(val);
          }
        },
        complete: () => {
          reject(new Error('Timeout wait for job coming'));
        },
      });

    return promise;
  }

  count(name: MailName) {
    return this.send.getCalls().filter(call => call.args[0].name === name)
      .length;
  }
}
