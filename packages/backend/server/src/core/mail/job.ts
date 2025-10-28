import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getStreamAsBuffer } from 'get-stream';

import { Cache, JOB_SIGNAL, JobQueue, OnJob, sleep } from '../../base';
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
    'notification.sendMail': { startTime: number } & {
      [K in MailName]: SendMailJob<K>;
    }[MailName];
  }
}

const sendMailKey = 'mailjob:sendMail';
const retryMailKey = 'mailjob:sendMail:retry';
const sendMailCacheKey = (name: string, to: string) =>
  `${sendMailKey}:${name}:${to}`;
const retryMaxPerTick = 20;
const retryFirstTime = 3;

@Injectable()
export class MailJob {
  private readonly logger = new Logger('MailJob');

  constructor(
    private readonly cache: Cache,
    private readonly queue: JobQueue,
    private readonly sender: MailSender,
    private readonly doc: DocReader,
    private readonly workspaceBlob: WorkspaceBlobStorage,
    private readonly models: Models
  ) {}

  private calculateRetryDelay(startTime: number) {
    const elapsed = Date.now() - startTime;
    return Math.min(30 * 1000, Math.round(elapsed / 2000) * 1000);
  }

  private async sendMailInternal({
    startTime,
    name,
    to,
    props,
  }: Jobs['notification.sendMail']) {
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

    try {
      const result = await this.sender.send(name, {
        to,
        ...(await Renderers[name](
          // @ts-expect-error the job trigger part has been typechecked
          props
        )),
        ...options,
      });
      if (!result) {
        // wait for a while before retrying
        const retryDelay = this.calculateRetryDelay(startTime);
        await sleep(retryDelay);
        return JOB_SIGNAL.Retry;
      }
      return undefined;
    } catch (e) {
      this.logger.error(`Failed to send mail [${name}] to [${to}]`, e);
      // wait for a while before retrying
      const retryDelay = this.calculateRetryDelay(startTime);
      await sleep(retryDelay);
      return JOB_SIGNAL.Retry;
    }
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

  @OnJob('notification.sendMail')
  async sendMail(job: Jobs['notification.sendMail']) {
    const cacheKey = sendMailCacheKey(job.name, job.to);
    const retried = await this.cache.mapIncrease(sendMailKey, cacheKey, 1);
    if (retried <= retryFirstTime) {
      const ret = await this.sendMailInternal(job);
      if (!ret) await this.cache.mapDelete(sendMailKey, cacheKey);
      return ret;
    }
    await this.cache.mapSet(retryMailKey, cacheKey, JSON.stringify(job));
    await this.cache.mapDelete(sendMailKey, cacheKey);
    return undefined;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sendRetryMails() {
    // pick random one from the retry map
    let processed = 0;
    let key = await this.cache.mapRandomKey(retryMailKey);
    while (key && processed < retryMaxPerTick) {
      try {
        const job = await this.cache.mapGet<string>(retryMailKey, key);
        if (job) {
          const jobData = JSON.parse(job) as Jobs['notification.sendMail'];
          await this.queue.add('notification.sendMail', jobData);
          // wait for a while before retrying
          const retryDelay = this.calculateRetryDelay(jobData.startTime);
          await sleep(retryDelay);
        }
        await this.cache.mapDelete(retryMailKey, key);
      } catch (e) {
        this.logger.error(
          `Failed to re-queue retry mail job for key [${key}]`,
          e
        );
      }
      key = await this.cache.mapRandomKey(retryMailKey);
      processed++;
    }
  }
}
