import { Injectable } from '@nestjs/common';
import { getStreamAsBuffer } from 'get-stream';

import { JOB_SIGNAL, OnJob } from '../../base';
import { type MailName, MailProps, Renderers } from '../../mails';
import { UserProps, WorkspaceProps } from '../../mails/components';
import { Models } from '../../models';
import { DocReader } from '../doc/reader';
import { WorkspaceBlobStorage } from '../storage';
import { MailSender, SendOptions } from './sender';

type DynamicallyFetchedProps<Props> = {
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

type SendMailJob<Mail extends MailName = MailName, Props = MailProps<Mail>> = {
  name: Mail;
  to: string;
  // NOTE(@forehalo):
  //   workspace avatar currently send as base64 img instead of a avatar url,
  //   so the content might be too large to be put in job payload.
  props: DynamicallyFetchedProps<Props>;
};

declare global {
  interface Jobs {
    'notification.sendMail': {
      [K in MailName]: SendMailJob<K>;
    }[MailName];
  }
}

@Injectable()
export class MailJob {
  constructor(
    private readonly sender: MailSender,
    private readonly doc: DocReader,
    private readonly workspaceBlob: WorkspaceBlobStorage,
    private readonly models: Models
  ) {}

  @OnJob('notification.sendMail')
  async sendMail({ name, to, props }: Jobs['notification.sendMail']) {
    let options: Partial<SendOptions> = {};

    for (const key in props) {
      // @ts-expect-error allow
      const val = props[key];
      if (val && typeof val === 'object') {
        if ('$$workspaceId' in val) {
          const workspaceProps = await this.fetchWorkspaceProps(
            val.$$workspaceId
          );

          if (!workspaceProps) {
            return;
          }

          if (workspaceProps.avatar) {
            options.attachments = [
              {
                cid: 'workspaceAvatar',
                filename: 'workspaceAvatar',
                content: workspaceProps.avatar,
                encoding: 'base64',
              },
            ];
            workspaceProps.avatar = 'cid:workspaceAvatar';
          }
          // @ts-expect-error replacement
          props[key] = workspaceProps;
        } else if ('$$userId' in val) {
          const userProps = await this.fetchUserProps(val.$$userId);

          if (!userProps) {
            return;
          }

          // @ts-expect-error replacement
          props[key] = userProps;
        }
      }
    }

    const result = await this.sender.send(name, {
      to,
      ...(await Renderers[name](
        // @ts-expect-error the job trigger part has been typechecked
        props
      )),
      ...options,
    });

    return result === false ? JOB_SIGNAL.Retry : undefined;
  }

  private async fetchWorkspaceProps(workspaceId: string) {
    const workspace = await this.doc.getWorkspaceContent(workspaceId);

    if (!workspace) {
      return;
    }

    const props: WorkspaceProps = {
      name: workspace.name,
    };

    if (workspace.avatarKey) {
      const avatar = await this.workspaceBlob.get(
        workspace.id,
        workspace.avatarKey
      );

      if (avatar.body) {
        props.avatar = (await getStreamAsBuffer(avatar.body)).toString(
          'base64'
        );
      }
    }

    return props;
  }

  private async fetchUserProps(userId: string) {
    const user = await this.models.user.getWorkspaceUser(userId);
    if (!user) {
      return;
    }

    return { email: user.email } satisfies UserProps;
  }
}
