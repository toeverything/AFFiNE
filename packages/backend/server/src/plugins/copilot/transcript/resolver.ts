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

import type { FileUpload } from '../../../base';
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

  @Field(() => [TranscriptionItemType], { nullable: true })
  transcription!: TranscriptionItemType[] | null;

  @Field(() => String, { nullable: true })
  summary!: string | null;

  @Field(() => AiJobStatus)
  status!: AiJobStatus;
}

@Injectable()
@Resolver(() => CopilotType)
export class CopilotTranscriptionResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly service: CopilotTranscriptionService
  ) {}

  private handleJobResult(
    job: TranscriptionJob | null
  ): TranscriptionResultType | null {
    if (job) {
      const { transcription: ret, status } = job;
      return {
        id: job.id,
        transcription: ret?.transcription || null,
        summary: ret?.summary || null,
        status,
      };
    }
    return null;
  }

  @Mutation(() => TranscriptionResultType, { nullable: true })
  async submitAudioTranscription(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('blobId') blobId: string,
    @Args({ name: 'blob', type: () => GraphQLUpload })
    blob: FileUpload
  ): Promise<TranscriptionResultType | null> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const job = await this.service.submitTranscriptionJob(
      user.id,
      workspaceId,
      blobId,
      blob
    );

    return this.handleJobResult(job);
  }

  @Mutation(() => TranscriptionResultType, { nullable: true })
  async claimAudioTranscription(
    @CurrentUser() user: CurrentUser,
    @Args('jobId') jobId: string
  ): Promise<TranscriptionResultType | null> {
    const job = await this.service.claimTranscriptionJob(user.id, jobId);
    return this.handleJobResult(job);
  }

  @ResolveField(() => [TranscriptionResultType], {})
  async audioTranscription(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('jobId', { nullable: true })
    jobId: string
  ): Promise<TranscriptionResultType | null> {
    if (!copilot.workspaceId) return null;
    await this.ac
      .user(user.id)
      .workspace(copilot.workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const job = await this.service.queryTranscriptionJob(
      user.id,
      copilot.workspaceId,
      jobId
    );
    return this.handleJobResult(job);
  }
}
