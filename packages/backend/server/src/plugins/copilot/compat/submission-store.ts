import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Cache } from '../../../base';
import type { PromptMessage } from '../providers/types';

const SUBMISSION_TTL = 24 * 60 * 60 * 1000;

type StoredCompatSubmission = {
  id: string;
  sessionId: string;
  content?: string;
  attachments?: PromptMessage['attachments'];
  params?: Record<string, any>;
  createdAt: string;
};

type StoredAcceptedSubmission = {
  sessionId: string;
  turnId: string;
  acceptedAt: string;
};

export type CompatSubmission = Omit<StoredCompatSubmission, 'createdAt'> & {
  createdAt: Date;
};

export type AcceptedCompatSubmission = Omit<
  StoredAcceptedSubmission,
  'acceptedAt'
> & {
  acceptedAt: Date;
};

@Injectable()
export class CompatSubmissionStore {
  constructor(private readonly cache: Cache) {}

  private submissionKey(token: string) {
    return `copilot:submission:${token}`;
  }

  private acceptedKey(token: string) {
    return `copilot:submission:${token}:accepted`;
  }

  private fromStoredSubmission(
    submission?: StoredCompatSubmission
  ): CompatSubmission | undefined {
    if (!submission) {
      return;
    }

    return {
      ...submission,
      createdAt: new Date(submission.createdAt),
    };
  }

  private fromStoredAccepted(
    accepted?: StoredAcceptedSubmission
  ): AcceptedCompatSubmission | undefined {
    if (!accepted) {
      return;
    }

    return {
      ...accepted,
      acceptedAt: new Date(accepted.acceptedAt),
    };
  }

  async create(
    submission: Omit<CompatSubmission, 'id' | 'createdAt'>
  ): Promise<string> {
    const token = randomUUID();
    const stored: StoredCompatSubmission = {
      ...submission,
      id: token,
      createdAt: new Date().toISOString(),
    };

    await this.cache.set(this.submissionKey(token), stored, {
      ttl: SUBMISSION_TTL,
    });
    return token;
  }

  async get(token: string): Promise<CompatSubmission | undefined> {
    return this.fromStoredSubmission(
      await this.cache.get<StoredCompatSubmission>(this.submissionKey(token))
    );
  }

  async markAccepted(
    token: string,
    accepted: { sessionId: string; turnId: string }
  ) {
    await this.cache.set<StoredAcceptedSubmission>(
      this.acceptedKey(token),
      {
        ...accepted,
        acceptedAt: new Date().toISOString(),
      },
      { ttl: SUBMISSION_TTL }
    );
    await this.cache.delete(this.submissionKey(token));
  }

  async getAccepted(
    token: string
  ): Promise<AcceptedCompatSubmission | undefined> {
    return this.fromStoredAccepted(
      await this.cache.get<StoredAcceptedSubmission>(this.acceptedKey(token))
    );
  }
}
