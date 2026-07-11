import {
  ExistingProvider,
  FactoryProvider,
  Global,
  Module,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { ApplyType } from '../base';
import { AccessTokenModel } from './access-token';
import { AuthSessionModel } from './auth-session';
import { BlobModel } from './blob';
import { CalendarAccountModel } from './calendar-account';
import { CalendarEventModel } from './calendar-event';
import { CalendarEventInstanceModel } from './calendar-event-instance';
import { CalendarSubscriptionModel } from './calendar-subscription';
import { CommentModel } from './comment';
import { CommentAttachmentModel } from './comment-attachment';
import { AppConfigModel } from './config';
import { CopilotActionRunModel } from './copilot-action-run';
import { CopilotWorkspaceByokConfigModel } from './copilot-byok';
import { CopilotContextModel } from './copilot-context';
import { CopilotJobModel } from './copilot-job';
import { CopilotSessionModel } from './copilot-session';
import { CopilotTranscriptTaskModel } from './copilot-transcript-task';
import { CopilotUsageModel } from './copilot-usage';
import { CopilotWorkspaceConfigModel } from './copilot-workspace';
import { DocModel } from './doc';
import { DocUserModel } from './doc-user';
import { FeatureModel } from './feature';
import { HistoryModel } from './history';
import { MagicLinkOtpModel } from './magic-link-otp';
import { MailDeliveryModel } from './mail-delivery';
import { NotificationModel } from './notification';
import { PermissionProjectionModel } from './permission-projection';
import {
  DocAccessPolicyModel,
  DocGrantModel,
  WorkspaceAccessPolicyModel,
  WorkspaceInvitationModel,
  WorkspaceMemberModel,
} from './permission-write';
import { MODELS_SYMBOL } from './provider';
import { SessionModel } from './session';
import { UserModel } from './user';
import { UserDocModel } from './user-doc';
import { UserFeatureModel } from './user-feature';
import { UserSettingsModel } from './user-settings';
import { VerificationTokenModel } from './verification-token';
import { WorkspaceModel } from './workspace';
import { WorkspaceAnalyticsModel } from './workspace-analytics';
import { WorkspaceCalendarModel } from './workspace-calendar';
import { WorkspaceFeatureModel } from './workspace-feature';
import { WorkspaceRuntimeStateModel } from './workspace-runtime-state';
import { WorkspaceUserModel } from './workspace-user';

const MODELS = {
  user: UserModel,
  session: SessionModel,
  verificationToken: VerificationTokenModel,
  magicLinkOtp: MagicLinkOtpModel,
  mailDelivery: MailDeliveryModel,
  authSession: AuthSessionModel,
  feature: FeatureModel,
  workspace: WorkspaceModel,
  userFeature: UserFeatureModel,
  workspaceFeature: WorkspaceFeatureModel,
  workspaceRuntimeState: WorkspaceRuntimeStateModel,
  doc: DocModel,
  userDoc: UserDocModel,
  workspaceUser: WorkspaceUserModel,
  docUser: DocUserModel,
  history: HistoryModel,
  notification: NotificationModel,
  permissionProjection: PermissionProjectionModel,
  workspaceMember: WorkspaceMemberModel,
  workspaceInvitation: WorkspaceInvitationModel,
  workspaceAccessPolicy: WorkspaceAccessPolicyModel,
  docAccessPolicy: DocAccessPolicyModel,
  docGrant: DocGrantModel,
  userSettings: UserSettingsModel,
  copilotSession: CopilotSessionModel,
  copilotUsage: CopilotUsageModel,
  copilotTranscriptTask: CopilotTranscriptTaskModel,
  copilotActionRun: CopilotActionRunModel,
  copilotContext: CopilotContextModel,
  copilotWorkspace: CopilotWorkspaceConfigModel,
  copilotWorkspaceByokConfig: CopilotWorkspaceByokConfigModel,
  copilotJob: CopilotJobModel,
  appConfig: AppConfigModel,
  comment: CommentModel,
  commentAttachment: CommentAttachmentModel,
  blob: BlobModel,
  accessToken: AccessTokenModel,
  calendarAccount: CalendarAccountModel,
  calendarSubscription: CalendarSubscriptionModel,
  calendarEvent: CalendarEventModel,
  calendarEventInstance: CalendarEventInstanceModel,
  workspaceCalendar: WorkspaceCalendarModel,
  workspaceAnalytics: WorkspaceAnalyticsModel,
};

type ModelsType = {
  [K in keyof typeof MODELS]: InstanceType<(typeof MODELS)[K]>;
};

export class Models extends ApplyType<ModelsType>() {}

const ModelsProvider: FactoryProvider = {
  provide: Models,
  useFactory: (ref: ModuleRef) => {
    return new Proxy({} as any, {
      get: (target, prop) => {
        // cache
        if (prop in target) {
          return target[prop];
        }

        // find the model instance
        // @ts-expect-error null detection happens right after
        const Model = MODELS[prop];
        if (!Model) {
          return undefined;
        }

        const model = ref.get(Model);

        if (!model) {
          throw new Error(`Failed to initialize model ${Model.name}`);
        }

        target[prop] = model;
        return model;
      },
    });
  },
  inject: [ModuleRef],
};

const ModelsSymbolProvider: ExistingProvider = {
  provide: MODELS_SYMBOL,
  useExisting: Models,
};

@Global()
@Module({
  providers: [...Object.values(MODELS), ModelsProvider, ModelsSymbolProvider],
  exports: [ModelsProvider],
})
export class ModelsModule {}

export * from './auth-session';
export * from './blob';
export * from './calendar-account';
export * from './calendar-event';
export * from './calendar-event-instance';
export * from './calendar-subscription';
export * from './comment';
export * from './comment-attachment';
export * from './common';
export * from './copilot-byok';
export * from './copilot-context';
export * from './copilot-job';
export * from './copilot-session';
export * from './copilot-transcript-task';
export * from './copilot-usage';
export * from './copilot-workspace';
export * from './doc';
export * from './doc-user';
export * from './feature';
export * from './history';
export * from './magic-link-otp';
export * from './mail-delivery';
export * from './notification';
export * from './permission-projection';
export * from './permission-write';
export * from './session';
export * from './user';
export * from './user-doc';
export * from './user-feature';
export * from './user-settings';
export * from './verification-token';
export * from './workspace';
export * from './workspace-analytics';
export * from './workspace-calendar';
export * from './workspace-feature';
export * from './workspace-runtime-state';
export * from './workspace-user';
