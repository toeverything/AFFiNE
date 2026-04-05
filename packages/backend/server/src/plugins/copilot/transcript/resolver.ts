import { Injectable } from '@nestjs/common';
import {
  Args,
  Field,
  Float,
  ID,
  InputType,
  Int,
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
import { buildLegacyProjection } from './projection';
import { CopilotTranscriptionService, TranscriptionJob } from './service';
import type {
  AudioSliceManifestItem,
  MeetingActionItem,
  MeetingSummaryV2,
  NormalizedTranscriptSegment,
  TranscriptionItem,
  TranscriptionPayload,
  TranscriptionQuality,
  TranscriptionSourceAudio,
  TranscriptionSubmitInput,
} from './types';

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
class AudioSliceManifestItemType implements AudioSliceManifestItem {
  @Field(() => Int)
  index!: number;

  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Float)
  startSec!: number;

  @Field(() => Float)
  durationSec!: number;

  @Field(() => Int, { nullable: true })
  byteSize!: number | null;
}

@ObjectType()
class NormalizedTranscriptSegmentType implements NormalizedTranscriptSegment {
  @Field(() => String)
  speaker!: string;

  @Field(() => Float)
  startSec!: number;

  @Field(() => Float)
  endSec!: number;

  @Field(() => String)
  start!: string;

  @Field(() => String)
  end!: string;

  @Field(() => String)
  text!: string;
}

@ObjectType()
class MeetingActionItemType implements MeetingActionItem {
  @Field(() => String)
  description!: string;

  @Field(() => String, { nullable: true })
  owner!: string | null;

  @Field(() => String, { nullable: true })
  deadline!: string | null;
}

@ObjectType()
class MeetingSummaryV2Type implements MeetingSummaryV2 {
  @Field(() => String)
  title!: string;

  @Field(() => Float)
  durationMinutes!: number;

  @Field(() => [String])
  attendees!: string[];

  @Field(() => [String])
  keyPoints!: string[];

  @Field(() => [MeetingActionItemType])
  actionItems!: MeetingActionItemType[];

  @Field(() => [String])
  decisions!: string[];

  @Field(() => [String])
  openQuestions!: string[];

  @Field(() => [String])
  blockers!: string[];
}

@ObjectType()
class TranscriptionSourceAudioType implements TranscriptionSourceAudio {
  @Field(() => String, { nullable: true })
  blobId!: string | null;

  @Field(() => String, { nullable: true })
  mimeType!: string | null;

  @Field(() => Int, { nullable: true })
  durationMs!: number | null;

  @Field(() => Int, { nullable: true })
  sampleRate!: number | null;

  @Field(() => Int, { nullable: true })
  channels!: number | null;
}

@ObjectType()
class TranscriptionQualityType implements TranscriptionQuality {
  @Field(() => Boolean, { nullable: true })
  degraded!: boolean | null;

  @Field(() => Int, { nullable: true })
  overflowCount!: number | null;
}

@InputType()
class AudioSliceManifestItemInput implements AudioSliceManifestItem {
  @Field(() => Int)
  index!: number;

  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Float)
  startSec!: number;

  @Field(() => Float)
  durationSec!: number;

  @Field(() => Int, { nullable: true })
  byteSize?: number | null;
}

@InputType()
class TranscriptionSourceAudioInput implements Omit<
  TranscriptionSourceAudio,
  'blobId'
> {
  @Field(() => String, { nullable: true })
  mimeType?: string | null;

  @Field(() => Int, { nullable: true })
  durationMs?: number | null;

  @Field(() => Int, { nullable: true })
  sampleRate?: number | null;

  @Field(() => Int, { nullable: true })
  channels?: number | null;
}

@InputType()
class TranscriptionQualityInput implements TranscriptionQuality {
  @Field(() => Boolean, { nullable: true })
  degraded?: boolean | null;

  @Field(() => Int, { nullable: true })
  overflowCount?: number | null;
}

@InputType()
class SubmitAudioTranscriptionInput implements TranscriptionSubmitInput {
  @Field(() => TranscriptionSourceAudioInput, { nullable: true })
  sourceAudio?: TranscriptionSourceAudioInput;

  @Field(() => TranscriptionQualityInput, { nullable: true })
  quality?: TranscriptionQualityInput;

  @Field(() => [AudioSliceManifestItemInput], { nullable: true })
  sliceManifest?: AudioSliceManifestItemInput[];
}

@ObjectType()
class TranscriptionResultType {
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

  @Field(() => TranscriptionSourceAudioType, { nullable: true })
  sourceAudio!: TranscriptionPayload['sourceAudio'] | null;

  @Field(() => TranscriptionQualityType, { nullable: true })
  quality!: TranscriptionPayload['quality'] | null;

  @Field(() => [AudioSliceManifestItemType], { nullable: true })
  sliceManifest!: TranscriptionPayload['sliceManifest'] | null;

  @Field(() => [NormalizedTranscriptSegmentType], { nullable: true })
  normalizedSegments!: TranscriptionPayload['normalizedSegments'] | null;

  @Field(() => String, { nullable: true })
  normalizedTranscript!: string | null;

  @Field(() => MeetingSummaryV2Type, { nullable: true })
  summaryJson!: TranscriptionPayload['summaryJson'] | null;

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
      const legacy = ret ? buildLegacyProjection(ret) : null;
      const finalJob: TranscriptionResultType = {
        id: job.id,
        status,
        title: null,
        summary: null,
        actions: null,
        transcription: null,
        sourceAudio: null,
        quality: null,
        sliceManifest: null,
        normalizedSegments: null,
        normalizedTranscript: null,
        summaryJson: null,
      };
      if (FinishedStatus.has(finalJob.status)) {
        finalJob.title = legacy?.title ?? null;
        finalJob.summary = legacy?.summary ?? null;
        finalJob.actions = legacy?.actions ?? null;
        finalJob.transcription = legacy?.transcription ?? null;
        finalJob.sourceAudio = ret?.sourceAudio ?? null;
        finalJob.quality = ret?.quality ?? null;
        finalJob.sliceManifest = ret?.sliceManifest ?? null;
        finalJob.normalizedSegments = ret?.normalizedSegments ?? null;
        finalJob.normalizedTranscript = ret?.normalizedTranscript ?? null;
        finalJob.summaryJson = ret?.summaryJson ?? null;
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
    blobs: FileUpload[] | null,
    @Args({
      name: 'input',
      type: () => SubmitAudioTranscriptionInput,
      nullable: true,
    })
    input: SubmitAudioTranscriptionInput | null
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
      // oxlint-disable-next-line @typescript-eslint/await-thenable
      await Promise.all(allBlobs),
      input ?? undefined
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
