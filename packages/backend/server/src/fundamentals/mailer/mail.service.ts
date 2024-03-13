import { Inject, Injectable, Optional } from '@nestjs/common';

import { Config } from '../config';
import { URLHelper } from '../helpers';
import { MAILER_SERVICE, type MailerService, type Options } from './mailer';
import { emailTemplate } from './template';
@Injectable()
export class MailService {
  constructor(
    private readonly config: Config,
    private readonly url: URLHelper,
    @Optional() @Inject(MAILER_SERVICE) private readonly mailer?: MailerService
  ) {}

  async sendMail(options: Options) {
    if (!this.mailer) {
      throw new Error('Mailer service is not configured.');
    }

    return this.mailer.sendMail({
      from: this.config.mailer?.from,
      ...options,
    });
  }

  hasConfigured() {
    return !!this.mailer;
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
    const buttonUrl = this.url.link(`/invite/${inviteId}`);
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

    const html = emailTemplate({
      title: 'You are invited!',
      content,
      buttonContent: 'Accept & Join',
      buttonUrl,
    });

    return this.sendMail({
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

  async sendSignUpMail(url: string, options: Options) {
    const html = emailTemplate({
      title: 'Create AFFiNE Account',
      content:
        'Click the button below to complete your account creation and sign in. This magic link will expire in 30 minutes.',
      buttonContent: ' Create account and sign in',
      buttonUrl: url,
    });

    return this.sendMail({
      html,
      subject: 'Your AFFiNE account is waiting for you!',
      ...options,
    });
  }

  async sendSignInMail(url: string, options: Options) {
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
      to,
      subject: `Verify your new email for AFFiNE`,
      html,
    });
  }
  async sendVerifyEmail(to: string, url: string) {
    const html = emailTemplate({
      title: 'Verify your email address',
      content:
        'You recently requested to verify the email address associated with your AFFiNE account. To complete this process, please click on the verification link below. This magic link will expire in 30 minutes.',
      buttonContent: 'Verify your email address',
      buttonUrl: url,
    });
    return this.sendMail({
      to,
      subject: `Verify your email for AFFiNE`,
      html,
    });
  }
  async sendNotificationChangeEmail(to: string) {
    const html = emailTemplate({
      title: 'Email change successful',
      content: `As per your request, we have changed your email. Please make sure you're using ${to} when you log in the next time. `,
    });
    return this.sendMail({
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
      to,
      subject: title,
      html,
    });
  }
}
