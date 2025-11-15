import { Injectable } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Mutation,
  ObjectType,
  Parent,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { AiJobStatus } from '@prisma/client';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import {
  CopilotTranscriptionAudioNotProvided,
  type FileUpload,
} from '../../../base';
import { CurrentUser } from '../../../core/auth';
import { AccessController } from '../../../core/permission';
import { CopilotType } from '../resolver';
import { CopilotTranscriptionService, TranscriptionJob } from './service';
import type { TranscriptionItem, TranscriptionPayload } from './types';

registerEnumType(AiJobStatus, {
  name: 'AiJobStatus',
});

@ObjectType()
class TranscriptionItemType implements TranscriptionItem {
  @Field(() => String)
  speaker!: string;

  @Field(() => String)
  start!: string;

  @Field(() => String)
  end!: string;

  @Field(() => String)
  transcription!: string;
}

@ObjectType()
class TranscriptionResultType implements TranscriptionPayload {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  title!: string | null;

  @Field(() => String, { nullable: true })
  summary!: string | null;

  @Field(() => String, { nullable: true })
  actions!: string | null;

  @Field(() => [TranscriptionItemType], { nullable: true })
  transcription!: TranscriptionItemType[] | null;

  @Field(() => AiJobStatus)
  status!: AiJobStatus;
}

const FinishedStatus: Set<AiJobStatus> = new Set([
  AiJobStatus.finished,
  AiJobStatus.claimed,
]);

@Injectable()
@Resolver(() => CopilotType)
export class CopilotTranscriptionResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly transcript: CopilotTranscriptionService
  ) {}

  private handleJobResult(
    job: TranscriptionJob | null
  ): TranscriptionResultType | null {
    if (job) {
      const { transcription: ret, status } = job;
      const finalJob: TranscriptionResultType = {
        id: job.id,
        status,
        title: null,
        summary: null,
        actions: null,
        transcription: null,
      };
      if (FinishedStatus.has(finalJob.status)) {
        finalJob.title = ret?.title || null;
        finalJob.summary = ret?.summary || null;
        finalJob.actions = ret?.actions || null;
        finalJob.transcription = ret?.transcription || null;
      }
      return finalJob;
    }
    return null;
  }

  @Mutation(() => TranscriptionResultType, { nullable: true })
  async submitAudioTranscription(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('blobId') blobId: string,
    @Args({ name: 'blob', type: () => GraphQLUpload, nullable: true })
    blob: FileUpload | null,
    @Args({ name: 'blobs', type: () => [GraphQLUpload], nullable: true })
    blobs: FileUpload[] | null
  ): Promise<TranscriptionResultType | null> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');
    // merge blobs
    const allBlobs = blob ? [blob, ...(blobs || [])].filter(v => !!v) : blobs;
    if (!allBlobs || allBlobs.length === 0) {
      throw new CopilotTranscriptionAudioNotProvided();
    }

    const jobResult = await this.transcript.submitJob(
      user.id,
      workspaceId,
      blobId,
      await Promise.all(allBlobs)
    );

    return this.handleJobResult(jobResult);
  }

  @Mutation(() => TranscriptionResultType, { nullable: true })
  async retryAudioTranscription(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('jobId') jobId: string
  ): Promise<TranscriptionResultType | null> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const jobResult = await this.transcript.retryJob(
      user.id,
      workspaceId,
      jobId
    );

    return this.handleJobResult(jobResult);
  }

  @Mutation(() => TranscriptionResultType, { nullable: true })
  async claimAudioTranscription(
    @CurrentUser() user: CurrentUser,
    @Args('jobId') jobId: string
  ): Promise<TranscriptionResultType | null> {
    const job = await this.transcript.claimJob(user.id, jobId);
    return this.handleJobResult(job);
  }

  @ResolveField(() => TranscriptionResultType, {
    nullable: true,
  })
  async audioTranscription(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('jobId', { nullable: true })
    jobId?: string,
    @Args('blobId', { nullable: true })
    blobId?: string
  ): Promise<TranscriptionResultType | null> {
    if (!copilot.workspaceId) return null;
    if (!jobId && !blobId) return null;

    await this.ac
      .user(user.id)
      .workspace(copilot.workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const job = await this.transcript.queryJob(
      user.id,
      copilot.workspaceId,
      jobId,
      blobId
    );
    return this.handleJobResult(job);
  }
}
