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
    // TODO: use callback url when need support desktop app
    const buttonUrl = `${this.config.origin}/invite/${inviteId}`;
    const workspaceAvatar = invitationInfo.workspace.avatar;

    const content = `<p style="margin:0">${
      invitationInfo.user.avatar
        ? `<img
    src="${invitationInfo.user.avatar}"
    alt=""
    width="24px"
    height="24px"
    style="width:24px; height:24px; border-radius: 12px;object-fit: cover;vertical-align: middle"
  />`
        : ''
    }
  <span style="font-weight:500;margin-right: 4px;">${
    invitationInfo.user.name
  }</span>
  <span>invited you to join</span>
  <img
    src="cid:workspaceAvatar"
    alt=""
    width="24px"
    height="24px"
    style="width:24px; height:24px; margin-left:4px;border-radius: 12px;object-fit: cover;vertical-align: middle"
  />
  <span style="font-weight:500;margin-right: 4px;">${
    invitationInfo.workspace.name
  }</span></p><p style="margin-top:8px;margin-bottom:0;">Click button to join this workspace</p>`;

    const subContent =
      'Currently, AFFiNE Cloud is in the early access stage. Only Early Access Sponsors can register and log in to AFFiNE Cloud. <a href="https://community.affine.pro/c/insider-general/" style="color: #1e67af" >Please click here for more information.</a>';

    const html = emailTemplate({
      title: 'You are invited!',
      content,
      buttonContent: 'Accept & Join',
      buttonUrl,
      subContent,
    });

    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `${invitationInfo.user.name} invited you to join ${invitationInfo.workspace.name}`,
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
  async sendVerifyChangeEmail(to: string, url: string) {
    const html = emailTemplate({
      title: 'Verify your new email address',
      content:
        'You recently requested to change the email address associated with your AFFiNE account. To complete this process, please click on the verification link below. This magic link will expire in 30 minutes.',
      buttonContent: 'Verify your new email address',
      buttonUrl: url,
    });
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Verify your new email for AFFiNE`,
      html,
    });
  }
  async sendNotificationChangeEmail(to: string) {
    const html = emailTemplate({
      title: 'Email change successful',
      content: `As per your request, we have changed your email. Please make sure you're using ${to} when you log in the next time. `,
    });
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: `Your email has been changed`,
      html,
    });
  }
  async sendAcceptedEmail(
    to: string,
    {
      inviteeName,
      workspaceName,
    }: {
      inviteeName: string;
      workspaceName: string;
    }
  ) {
    const title = `${inviteeName} accepted your invitation`;

    const html = emailTemplate({
      title,
      content: `${inviteeName} has joined ${workspaceName}`,
    });
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: title,
      html,
    });
  }
  async sendLeaveWorkspaceEmail(
    to: string,
    {
      inviteeName,
      workspaceName,
    }: {
      inviteeName: string;
      workspaceName: string;
    }
  ) {
    const title = `${inviteeName} left ${workspaceName}`;

    const html = emailTemplate({
      title,
      content: `${inviteeName} has left your workspace`,
    });
    return this.sendMail({
      from: this.config.auth.email.sender,
      to,
      subject: title,
      html,
    });
  }
}
