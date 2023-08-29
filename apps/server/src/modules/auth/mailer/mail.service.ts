import { Inject, Injectable } from '@nestjs/common';

import { Config } from '../../../config';
import {
  MAILER_SERVICE,
  type MailerService,
  type Options,
  type Response,
} from './mailer';
import { emailTemplate } from './template';
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
        avatar: string;
      };
      user: {
        avatar: string;
        name: string;
      };
    }
  ) {
    console.log('invitationInfo', invitationInfo);

    const buttonUrl = `${this.config.baseUrl}/invite/${inviteId}`;
    const workspaceAvatar = invitationInfo.workspace.avatar;

    const content = `  <img
    src="${invitationInfo.user.avatar}"
    alt=""
    width="24px"
    height="24px"
    style="border-radius: 12px;object-fit: cover;vertical-align: middle"
  />
  <span style="font-weight:500;margin-left:4px;margin-right: 10px;">${invitationInfo.user.name}</span>
  <span>invited you to join</span>
  <img
    src="cid:workspaceAvatar"
    alt=""
    width="24px"
    height="24px"
    style="margin-left:10px;border-radius: 12px;object-fit: cover;vertical-align: middle"
  />
  <span style="font-weight:500;margin-left:4px;margin-right: 10px;">${invitationInfo.workspace.name}</span>`;

    const html = emailTemplate({
      title: 'You are invited!',
      content,
      buttonContent: 'Accept & Join',
      buttonUrl,
    });

    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Invitation to workspace`,
      html,
      attachments: [
        {
          cid: 'workspaceAvatar',
          filename: 'image.png',
          content: workspaceAvatar,
          encoding: 'base64',
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
