import { Injectable } from '@nestjs/common';
import { AiJobStatus, AiJobType } from '@prisma/client';

import {
  CopilotPromptNotFound,
  CopilotTranscriptionJobExists,
  type FileUpload,
  JobQueue,
  NoCopilotProviderAvailable,
  OnJob,
} from '../../../base';
import { Models } from '../../../models';
import { PromptService } from '../prompt';
import { CopilotProviderService } from '../providers';
import { CopilotStorage } from '../storage';
import {
  CopilotCapability,
  CopilotTextProvider,
  PromptMessage,
} from '../types';
import {
  TranscriptionPayload,
  TranscriptionSchema,
  TranscriptPayloadSchema,
} from './types';
import { readStream } from './utils';

export type TranscriptionJob = {
  id: string;
  status: AiJobStatus;
  transcription?: TranscriptionPayload;
};

@Injectable()
export class CopilotTranscriptionService {
  constructor(
    private readonly models: Models,
    private readonly job: JobQueue,
    private readonly storage: CopilotStorage,
    private readonly prompt: PromptService,
    private readonly provider: CopilotProviderService
  ) {}

  async submitTranscriptionJob(
    userId: string,
    workspaceId: string,
    blobId: string,
    blob: FileUpload
  ): Promise<TranscriptionJob> {
    if (await this.models.copilotJob.has(workspaceId, blobId)) {
      throw new CopilotTranscriptionJobExists();
    }

    const { id: jobId, status } = await this.models.copilotJob.create({
      workspaceId,
      blobId,
      createdBy: userId,
      type: AiJobType.transcription,
    });

    const buffer = await readStream(blob.createReadStream());
    const url = await this.storage.put(userId, workspaceId, blobId, buffer);

    await this.models.copilotJob.update(jobId, {
      status: AiJobStatus.running,
    });

    await this.job.add(
      'copilot.transcript.submit',
      {
        jobId,
        url,
        mimeType: blob.mimetype,
      },
      // retry 3 times
      { removeOnFail: 3 }
    );

    return { id: jobId, status };
  }

  async claimTranscriptionJob(
    userId: string,
    jobId: string
  ): Promise<TranscriptionJob | null> {
    const status = await this.models.copilotJob.claim(jobId, userId);
    if (status === AiJobStatus.claimed) {
      const transcription = await this.models.copilotJob.getPayload(
        jobId,
        TranscriptPayloadSchema
      );
      return { id: jobId, transcription, status };
    }
    return null;
  }

  async queryTranscriptionJob(
    userId: string,
    workspaceId: string,
    jobId: string
  ) {
    const job = await this.models.copilotJob.getWithUser(
      userId,
      workspaceId,
      jobId,
      AiJobType.transcription
    );

    if (!job) {
      return null;
    }

    const ret: TranscriptionJob = { id: job.id, status: job.status };

    const payload = TranscriptPayloadSchema.safeParse(job.payload);
    if (payload.success) {
      ret.transcription = payload.data;
    }

    return ret;
  }

  private async getProvider(model: string): Promise<CopilotTextProvider> {
    let provider = await this.provider.getProviderByCapability(
      CopilotCapability.TextToText,
      model
    );

    if (!provider) {
      throw new NoCopilotProviderAvailable();
    }

    return provider;
  }

  private async chatWithPrompt(
    promptName: string,
    message: Partial<PromptMessage>
  ): Promise<string> {
    const prompt = await this.prompt.get(promptName);
    if (!prompt) {
      throw new CopilotPromptNotFound({ name: promptName });
    }

    const provider = await this.getProvider(prompt.model);
    return provider.generateText(
      [...prompt.finish({}), { role: 'user', content: '', ...message }],
      prompt.model
    );
  }

  private cleanupResponse(response: string): string {
    return response
      .replace(/```[\w\s]+\n/g, '')
      .replace(/\n```/g, '')
      .trim();
  }

  @OnJob('copilot.transcript.submit')
  async transcriptAudio({
    jobId,
    url,
    mimeType,
  }: Jobs['copilot.transcript.submit']) {
    const result = await this.chatWithPrompt('Transcript audio', {
      attachments: [url],
      params: { mimetype: mimeType },
    });

    const transcription = TranscriptionSchema.parse(
      JSON.parse(this.cleanupResponse(result))
    );
    await this.models.copilotJob.update(jobId, { payload: { transcription } });

    await this.job.add(
      'copilot.summary.submit',
      {
        jobId,
      },
      // retry 3 times
      { removeOnFail: 3 }
    );
  }

  @OnJob('copilot.summary.submit')
  async summaryTranscription({ jobId }: Jobs['copilot.summary.submit']) {
    const payload = await this.models.copilotJob.getPayload(
      jobId,
      TranscriptPayloadSchema
    );
    if (payload.transcription) {
      const content = payload.transcription
        .map(t => t.transcription)
        .join('\n');

      const result = await this.chatWithPrompt('Summary', { content });

      payload.summary = this.cleanupResponse(result);
      await this.models.copilotJob.update(jobId, { payload });
    } else {
      await this.models.copilotJob.update(jobId, {
        status: AiJobStatus.failed,
      });
    }
  }
}
