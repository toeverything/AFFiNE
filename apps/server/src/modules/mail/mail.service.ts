import { Inject, Injectable } from '@nestjs/common';

import { Config } from '../../config';
import { WorkspaceType } from '../workspaces';
import { MAILER_SERVICE, MailerService, Options, Response } from './mailer';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAILER_SERVICE) private readonly mailer: MailerService,
    private readonly config: Config
  ) {}

  private async sendMail(options: Options): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.mailer.sendMail(options, function (error, info) {
        if (error) {
          reject(error);
        } else {
          resolve(info);
        }
      });
    });
  }

  hasConfigured() {
    return (
      !!this.config.auth.email.login &&
      !!this.config.auth.email.password &&
      !!this.config.auth.email.sender
    );
  }

  async sendInviteEmail(
    to: string,
    workspace: WorkspaceType,
    inviteId: string
  ) {
    const url = `${this.config.baseUrl}/invite?id=${workspace.id}&invite=${inviteId}`;
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
}
