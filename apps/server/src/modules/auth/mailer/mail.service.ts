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

  async sendInviteEmail(
    to: string,
    inviteId: string,
    invitationInfo: {
      workspace: {
        id: string;
        name: string;
        avatar: Buffer | null;
      };
      user: {
        avatar: string;
        name: string;
      };
    }
  ) {
    const buttonUrl = `${this.config.baseUrl}/invite/${inviteId}`;
    const url = `${this.config.baseUrl}/workspaces/${invitationInfo.workspace.id}/all`;
    const workspaceAvatar = invitationInfo.workspace.avatar || new Buffer('');
    const html = `
          <h1>Invitation to workspace</h1>
    <p>
        <img
                    src="${invitationInfo.user.avatar}"
                    alt="Inviter avatar"
                    width="16px"
                    height="16px"
                  />
                  <span>${invitationInfo.user.name}</span>
                  <span>invited you to join</span>
                  <img
                    src="cid:workspaceAvatar"
                    alt="Workspace avatar"
                    width="16px"
                    height="16px"
                  />
                  <span>${invitationInfo.workspace.name}</span>

    </p>

    <p>${invitationInfo.user.avatar}</p>

    <a href="${buttonUrl}">${buttonUrl}</a>
    <p>
    <a
      href="${buttonUrl}"
      target="_blank"
      style="
        font-size: 15px;
        font-family: Inter;
        line-height: 24px;
        color: #fff;
        text-decoration: none;
        border-radius: 8px;
        padding: 8px 18px;
        border: 1px solid #1e96eb;
        background-color: #1e96eb;
        display: inline-block;
        font-weight: bold;
      "
      >Accept & Join</a
    >
</p>>
    <a href="${url}">${url}</a>
    `;

    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Invitation to workspace`,
      html,
      attachments: [
        {
          cid: 'workspaceAvatar',
          filename: 'image.jpg',
          content: workspaceAvatar,
        },
      ],
    });
  }
  async sendChangePasswordEmail(to: string, url: string) {
    const html = `
      <h1>Change password</h1>
      <p>Click button to open change password page</p>
      <a href="${url}">${url}</a>
    `;
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Change password`,
      html,
    });
  }

  async sendSetPasswordEmail(to: string, url: string) {
    const html = `
      <h1>Set password</h1>
      <p>Click button to open set password page</p>
      <a href="${url}">${url}</a>
    `;
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Change password`,
      html,
    });
  }
  async sendChangeEmail(to: string, url: string) {
    const html = `
      <h1>Change Email</h1>
      <p>Click button to open change email page</p>
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
