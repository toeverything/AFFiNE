import { render as rawRender } from '@react-email/components';

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

function render(component: React.ReactElement) {
  return rawRender(component, {
    pretty: env.testing,
  });
}

type Props<T> = T extends React.ComponentType<infer P> ? P : never;
export type EmailRenderer<Props> = (props: Props) => Promise<EmailContent>;

function make<T extends React.ComponentType<any>>(
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
      html: await render(<Component {...props} />),
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
    props => `${props.user.email} invited you to join ${props.workspace.name}`
  ),
  MemberAccepted: make(
    InvitationAccepted,
    props => `${props.user.email} accepted your invitation`
  ),
  MemberLeave: make(
    MemberLeave,
    props => `${props.user.email} left ${props.workspace.name}`
  ),
  LinkInvitationReviewRequest: make(
    LinkInvitationReviewRequest,
    props => `New request to join ${props.workspace.name}`
  ),
  LinkInvitationApprove: make(
    LinkInvitationApproved,
    props => `Your request to join ${props.workspace.name} has been approved`
  ),
  LinkInvitationDecline: make(
    LinkInvitationReviewDeclined,
    props => `Your request to join ${props.workspace.name} was declined`
  ),
  MemberRemoved: make(
    MemberRemoved,
    props => `You have been removed from ${props.workspace.name}`
  ),
  OwnershipTransferred: make(
    OwnershipTransferred,
    props => `Your ownership of ${props.workspace.name} has been transferred`
  ),
  OwnershipReceived: make(
    OwnershipReceived,
    props => `You are now the owner of ${props.workspace.name}`
  ),
  //#endregion

  //#region Doc
  Mention: make(
    Mention,
    props => `${props.user.email} mentioned you in ${props.doc.title}`
  ),
  Comment: make(
    Comment,
    props => `${props.user.email} commented on ${props.doc.title}`
  ),
  CommentMention: make(
    CommentMention,
    props =>
      `${props.user.email} mentioned you in a comment on ${props.doc.title}`
  ),
  //#endregion

  //#region Team
  TeamWorkspaceUpgraded: make(TeamWorkspaceUpgraded, props =>
    props.isOwner
      ? 'Your workspace has been upgraded to team workspace! 🎉'
      : `${props.workspace.name} has been upgraded to team workspace! 🎉`
  ),
  TeamBecomeAdmin: make(
    TeamBecomeAdmin,
    props => `You are now an admin of ${props.workspace.name}`
  ),
  TeamBecomeCollaborator: make(
    TeamBecomeCollaborator,
    props => `Your role has been changed in ${props.workspace.name}`
  ),
  TeamDeleteIn24Hours: make(
    TeamDeleteIn24Hours,
    props =>
      `[Action Required] Final warning: Your workspace ${props.workspace.name} will be deleted in 24 hours`
  ),
  TeamDeleteInOneMonth: make(
    TeamDeleteInOneMonth,
    props =>
      `[Action Required] Important: Your workspace ${props.workspace.name} will be deleted soon`
  ),
  TeamWorkspaceDeleted: make(
    TeamWorkspaceDeleted,
    props => `Your workspace ${props.workspace.name} has been deleted`
  ),
  TeamWorkspaceExpireSoon: make(
    TeamExpireSoon,
    props =>
      `[Action Required] Your ${props.workspace.name} team workspace will expire soon`
  ),
  TeamWorkspaceExpired: make(
    TeamExpired,
    props => `Your ${props.workspace.name} team workspace has expired`
  ),
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
