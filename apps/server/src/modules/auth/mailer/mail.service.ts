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

  async sendSignInEmail(url: string, options: Options) {
    const html = emailTemplate({
      title: 'Sign in to AFFiNE',
      content:
        'Click the button below to securely sign in. The magic link will expire in 30 minutes.',
      buttonContent: 'Sign in to AFFiNE',
      buttonUrl: url,
    });
    return this.sendMail({
      html,
      subject: 'Sign in to AFFiNE',
      ...options,
    });
  }

  async sendChangePasswordEmail(to: string, url: string) {
    const html = emailTemplate({
      title: 'Modify your AFFiNE password',
      content:
        'Click the button below to reset your password. The magic link will expire in 30 minutes.',
      buttonContent: 'Set new password',
      buttonUrl: url,
    });
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Modify your AFFiNE password`,
      html,
    });
  }

  async sendSetPasswordEmail(to: string, url: string) {
    const html = emailTemplate({
      title: 'Set your AFFiNE password',
      content:
        'Click the button below to set your password. The magic link will expire in 30 minutes.',
      buttonContent: 'Set your password',
      buttonUrl: url,
    });
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Set your AFFiNE password`,
      html,
    });
  }
  async sendChangeEmail(to: string, url: string) {
    const html = emailTemplate({
      title: 'Verify your current email for AFFiNE',
      content:
        'You recently requested to change the email address associated with your AFFiNE account. To complete this process, please click on the verification link below. This magic link will expire in 30 minutes.',
      buttonContent: 'Verify and set up a new email address',
      buttonUrl: url,
    });
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Verify your current email for AFFiNE`,
      html,
    });
  }
}
