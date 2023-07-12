import { Inject, Injectable } from '@nestjs/common';

import { Config } from '../../config';
import { MAILER_SERVICE, MailerResponse, MailerService } from './mailer';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAILER_SERVICE) private readonly mailer: MailerService,
    private readonly config: Config
  ) {}

  async sendMail(
    to: string,
    subject: string,
    html: string
  ): Promise<MailerResponse> {
    return new Promise((resolve, reject) => {
      this.mailer.sendMail(
        {
          from: this.config.auth.email.sender,
          to,
          subject,
          html,
        },
        function (error, info) {
          if (error) {
            reject(error);
          } else {
            resolve(info);
          }
        }
      );
    });
  }
}
