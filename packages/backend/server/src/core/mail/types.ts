import type { MailName, MailProps } from '../../mails';
import type { UserProps, WorkspaceProps } from '../../mails/components';
import type { RuntimeQuotaSourceInput } from '../backend-runtime';

export type MailDeliveryMetadata = {
  dedupeKey?: string;
  recipientUserId?: string;
  actorUserId?: string;
  workspaceId?: string;
  notificationId?: string;
  abuseSubjectKey?: string;
  source?: RuntimeQuotaSourceInput;
  expiresAt?: Date;
  maxAttempts?: number;
  priority?: 'critical' | 'high' | 'normal' | 'low';
};

export type DynamicallyFetchedProps<Props> = {
  [Key in keyof Props]: Props[Key] extends infer Prop
    ? Prop extends UserProps
      ? {
          $$userId: string;
        } & Omit<Prop, 'email' | 'avatar'>
      : Prop extends WorkspaceProps
        ? {
            $$workspaceId: string;
          } & Omit<Prop, 'name' | 'avatar'>
        : Prop
    : never;
};

export type SendMailPayload<
  Mail extends MailName = MailName,
  Props = MailProps<Mail>,
> = {
  name: Mail;
  to: string;
  props: DynamicallyFetchedProps<Props>;
};

export type SendMailCommand = {
  [K in MailName]: SendMailPayload<K>;
}[MailName] & {
  metadata?: MailDeliveryMetadata;
};
