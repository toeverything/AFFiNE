import { render as rawRender } from '@react-email/components';
import { type ComponentType, createElement, type ReactElement } from 'react';

import { Comment, CommentMention, Mention } from './docs';
import {
  TeamBecomeAdmin,
  TeamBecomeCollaborator,
  TeamDeleteIn24Hours,
  TeamDeleteInOneMonth,
  TeamExpired,
  TeamExpireSoon,
  TeamLicense,
  TeamWorkspaceDeleted,
  TeamWorkspaceUpgraded,
} from './teams';
import TestMail from './test-mail';
import {
  ChangeEmail,
  ChangeEmailNotification,
  ChangePassword,
  SetPassword,
  SignIn,
  SignUp,
  VerifyChangeEmail,
  VerifyEmail,
} from './users';
import {
  Invitation,
  InvitationAccepted,
  LinkInvitationApproved,
  LinkInvitationReviewDeclined,
  LinkInvitationReviewRequest,
  MemberLeave,
  MemberRemoved,
  OwnershipReceived,
  OwnershipTransferred,
} from './workspaces';

type EmailContent = {
  subject: string;
  html: string;
};

function render(component: ReactElement) {
  return rawRender(component, { pretty: env.testing });
}

type Props<T> = T extends ComponentType<infer P> ? P : never;
export type EmailRenderer<Props> = (props: Props) => Promise<EmailContent>;

function make<T extends ComponentType<any>>(
  Component: T,
  subject: string | ((props: Props<T>) => string)
): EmailRenderer<Props<T>> {
  return async props => {
    if (!props && env.testing) {
      // @ts-expect-error test only
      props = Component.PreviewProps;
    }
    return {
      subject: typeof subject === 'function' ? subject(props) : subject,
      html: await render(createElement(Component, props)),
    };
  };
}

export const Renderers = {
  //#region Test
  TestMail: make(TestMail, 'Test Email from AFFiNE'),
  //#endregion

  //#region User
  SignIn: make(SignIn, 'Sign in to AFFiNE'),
  SignUp: make(SignUp, 'Your AFFiNE account is waiting for you!'),
  SetPassword: make(SetPassword, 'Set your AFFiNE password'),
  ChangePassword: make(ChangePassword, 'Modify your AFFiNE password'),
  VerifyEmail: make(VerifyEmail, 'Verify your email address'),
  ChangeEmail: make(ChangeEmail, 'Change your email address'),
  VerifyChangeEmail: make(VerifyChangeEmail, 'Verify your new email address'),
  EmailChanged: make(ChangeEmailNotification, 'Account email address changed'),
  //#endregion

  //#region Workspace
  MemberInvitation: make(
    Invitation,
    'You were invited to join a workspace on AFFiNE'
  ),
  MemberAccepted: make(
    InvitationAccepted,
    'Your workspace invitation was accepted'
  ),
  MemberLeave: make(MemberLeave, 'A workspace member left'),
  LinkInvitationReviewRequest: make(
    LinkInvitationReviewRequest,
    'New request to join a workspace'
  ),
  LinkInvitationApprove: make(
    LinkInvitationApproved,
    'Your request to join a workspace has been approved'
  ),
  LinkInvitationDecline: make(
    LinkInvitationReviewDeclined,
    'Your request to join a workspace was declined'
  ),
  MemberRemoved: make(MemberRemoved, 'You have been removed from a workspace'),
  OwnershipTransferred: make(
    OwnershipTransferred,
    'Your workspace ownership has been transferred'
  ),
  OwnershipReceived: make(
    OwnershipReceived,
    'You are now the owner of a workspace'
  ),
  //#endregion

  //#region Doc
  Mention: make(Mention, 'You were mentioned in AFFiNE'),
  Comment: make(Comment, 'New comment in AFFiNE'),
  CommentMention: make(CommentMention, 'You were mentioned in a comment'),
  //#endregion

  //#region Team
  TeamWorkspaceUpgraded: make(TeamWorkspaceUpgraded, props =>
    props.isOwner
      ? 'Your workspace has been upgraded to team workspace! 🎉'
      : 'A workspace has been upgraded to team workspace! 🎉'
  ),
  TeamBecomeAdmin: make(TeamBecomeAdmin, 'You are now a workspace admin'),
  TeamBecomeCollaborator: make(
    TeamBecomeCollaborator,
    'Your workspace role has been changed'
  ),
  TeamDeleteIn24Hours: make(
    TeamDeleteIn24Hours,
    '[Action Required] Final warning: Your workspace will be deleted in 24 hours'
  ),
  TeamDeleteInOneMonth: make(
    TeamDeleteInOneMonth,
    '[Action Required] Important: Your workspace will be deleted soon'
  ),
  TeamWorkspaceDeleted: make(
    TeamWorkspaceDeleted,
    'Your workspace has been deleted'
  ),
  TeamWorkspaceExpireSoon: make(
    TeamExpireSoon,
    '[Action Required] Your team workspace will expire soon'
  ),
  TeamWorkspaceExpired: make(TeamExpired, 'Your team workspace has expired'),
  //#endregion

  //#region License
  TeamLicense: make(
    TeamLicense,
    'Your AFFiNE Self-Hosted Team Workspace license is ready'
  ),
  //#endregion
} as const;

export type MailName = keyof typeof Renderers;
export type MailProps<T extends MailName> = Parameters<
  (typeof Renderers)[T]
>[0];
