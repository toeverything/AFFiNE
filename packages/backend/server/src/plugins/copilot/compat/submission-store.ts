import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Cache } from '../../../base';
import type { PromptMessage } from '../providers/types';

const SUBMISSION_TTL = 24 * 60 * 60 * 1000;

type StoredCompatSubmission = {
  id: string;
  userId: string;
  workspaceId: string;
  sessionId: string;
  content?: string;
  attachments?: PromptMessage['attachments'];
  params?: Record<string, any>;
  createdAt: string;
};

type StoredAcceptedSubmission = {
  userId: string;
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

  private submissionKey(userId: string, token: string) {
    return `copilot:submission:${userId}:${token}`;
  }

  private acceptedKey(userId: string, token: string) {
    return `copilot:submission:${userId}:${token}:accepted`;
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

    await this.cache.set(this.submissionKey(submission.userId, token), stored, {
      ttl: SUBMISSION_TTL,
    });
    return token;
  }

  async get(
    token: string,
    userId: string
  ): Promise<CompatSubmission | undefined> {
    return this.fromStoredSubmission(
      await this.cache.get<StoredCompatSubmission>(
        this.submissionKey(userId, token)
      )
    );
  }

  async markAccepted(
    token: string,
    userId: string,
    accepted: { sessionId: string; turnId: string }
  ) {
    await this.cache.set<StoredAcceptedSubmission>(
      this.acceptedKey(userId, token),
      {
        ...accepted,
        userId,
        acceptedAt: new Date().toISOString(),
      },
      { ttl: SUBMISSION_TTL }
    );
    await this.cache.delete(this.submissionKey(userId, token));
  }

  async getAccepted(
    token: string,
    userId: string
  ): Promise<AcceptedCompatSubmission | undefined> {
    return this.fromStoredAccepted(
      await this.cache.get<StoredAcceptedSubmission>(
        this.acceptedKey(userId, token)
      )
    );
  }
}
