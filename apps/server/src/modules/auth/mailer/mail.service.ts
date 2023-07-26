import { Inject, Injectable } from '@nestjs/common';

import { Config } from '../../../config';
import {
  MAILER_SERVICE,
  type MailerService,
  type Options,
  type Response,
} from './mailer';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAILER_SERVICE) private readonly mailer: MailerService,
    private readonly config: Config
  ) {}

  async sendMail(options: Options): Promise<Response> {
    return this.mailer.sendMail(options);
  }

  hasConfigured() {
    return (
      !!this.config.auth.email.login &&
      !!this.config.auth.email.password &&
      !!this.config.auth.email.sender
    );
  }

  async sendInviteEmail(to: string, workspaceId: string, inviteId: string) {
    const url = `${this.config.baseUrl}/invite?id=${workspaceId}&invite=${inviteId}`;
    const html = `
      <h1>Invitation to workspace</h1>
      <p>You have been invited to workspace. Click the link below to accept the invitation.</p>
      <a href="${url}">${url}</a>
    `;
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Invitation to workspace`,
      html,
    });
  }
  async sendChangePasswordEmail(to: string, url: string) {
    const html = `
      <h1>Change password</h1>
      <p>change password email</p>
      <a href="${url}">${url}</a>
    `;
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Change password`,
      html,
    });
  }
}
