import {
  config as falConfig,
  stream as falStream,
} from '@fal-ai/serverless-client';
import { Injectable } from '@nestjs/common';
import { z, ZodType } from 'zod';

import {
  CopilotPromptInvalid,
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../base';
import { CopilotProvider } from './provider';
import type {
  CopilotChatOptions,
  CopilotImageOptions,
  ModelConditions,
  PromptMessage,
} from './types';
import { CopilotProviderType, ModelInputType, ModelOutputType } from './types';

export type FalConfig = {
  apiKey: string;
};

const FalImageSchema = z
  .object({
    url: z.string(),
    seed: z.number().nullable().optional(),
    content_type: z.string(),
    file_name: z.string().nullable().optional(),
    file_size: z.number().nullable().optional(),
    width: z.number(),
    height: z.number(),
  })
  .optional();

type FalImage = z.infer<typeof FalImageSchema>;

const FalResponseSchema = z.object({
  detail: z
    .union([
      z.array(z.object({ type: z.string(), msg: z.string() })),
      z.string(),
    ])
    .optional(),
  images: z.array(FalImageSchema).nullable().optional(),
  image: FalImageSchema.nullable().optional(),
  output: z.string().nullable().optional(),
});

type FalResponse = z.infer<typeof FalResponseSchema>;

const FalStreamOutputSchema = z.object({
  type: z.literal('output'),
  output: FalResponseSchema,
});

type FalPrompt = {
  model_name?: string;
  image_url?: string;
  prompt?: string;
  loras?: { path: string; scale?: number }[];
  controlnets?: {
    image_url: string;
    start_percentage?: number;
    end_percentage?: number;
  }[];
};

@Injectable()
export class FalProvider extends CopilotProvider<FalConfig> {
  override type = CopilotProviderType.FAL;

  override readonly models = [
    {
      id: 'flux-1/schnell',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Image],
          defaultForOutputType: true,
        },
      ],
    },
    // image to image models
    {
      id: 'lcm-sd15-i2i',
      capabilities: [
        {
          input: [ModelInputType.Image],
          output: [ModelOutputType.Image],
          defaultForOutputType: true,
        },
      ],
    },
    {
      id: 'clarity-upscaler',
      capabilities: [
        {
          input: [ModelInputType.Image],
          output: [ModelOutputType.Image],
        },
      ],
    },
    {
      id: 'face-to-sticker',
      capabilities: [
        {
          input: [ModelInputType.Image],
          output: [ModelOutputType.Image],
        },
      ],
    },
    {
      id: 'imageutils/rembg',
      capabilities: [
        {
          input: [ModelInputType.Image],
          output: [ModelOutputType.Image],
        },
      ],
    },
    {
      id: 'workflowutils/teed',
      capabilities: [
        {
          input: [ModelInputType.Image],
          output: [ModelOutputType.Image],
        },
      ],
    },
    {
      id: 'lora/image-to-image',
      capabilities: [
        {
          input: [ModelInputType.Image],
          output: [ModelOutputType.Image],
        },
      ],
    },
  ];

  override configured(): boolean {
    return !!this.config.apiKey;
  }

  protected override setup() {
    super.setup();
    falConfig({ credentials: this.config.apiKey });
  }

  private extractArray<T>(value: T | T[] | undefined): T[] {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }

  private extractPrompt(
    message?: PromptMessage,
    options: CopilotImageOptions = {}
  ): FalPrompt {
    if (!message) throw new CopilotPromptInvalid('Prompt is empty');
    const { content, attachments, params } = message;
    // prompt attachments require at least one
    if (!content && (!Array.isArray(attachments) || !attachments.length)) {
      throw new CopilotPromptInvalid('Prompt or Attachments is empty');
    }
    if (Array.isArray(attachments) && attachments.length > 1) {
      throw new CopilotPromptInvalid('Only one attachment is allowed');
    }
    const lora = [
      ...this.extractArray(params?.lora),
      ...this.extractArray(options.loras),
    ].filter(
      (v): v is { path: string; scale?: number } =>
        !!v && typeof v === 'object' && typeof v.path === 'string'
    );
    const controlnets = this.extractArray(params?.controlnets).filter(
      (v): v is { image_url: string } =>
        !!v && typeof v === 'object' && typeof v.image_url === 'string'
    );
    return {
      model_name: options.modelName || undefined,
      image_url: attachments
        ?.map(v =>
          typeof v === 'string'
            ? v
            : v.mimeType.startsWith('image/')
              ? v.attachment
              : undefined
        )
        .find(v => !!v),
      prompt: content.trim(),
      loras: lora.length ? lora : undefined,
      controlnets: controlnets.length ? controlnets : undefined,
    };
  }

  private extractFalError(
    resp: FalResponse,
    message?: string
  ): CopilotProviderSideError {
    if (Array.isArray(resp.detail) && resp.detail.length) {
      const error = resp.detail[0].msg;
      return new CopilotProviderSideError({
        provider: this.type,
        kind: resp.detail[0].type,
        message: message ? `${message}: ${error}` : error,
      });
    } else if (typeof resp.detail === 'string') {
      const error = resp.detail;
      return new CopilotProviderSideError({
        provider: this.type,
        kind: resp.detail,
        message: message ? `${message}: ${error}` : error,
      });
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unknown',
      message: 'No content generated',
    });
  }

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      // pass through user friendly errors
      return e;
    } else {
      const error = new CopilotProviderSideError({
        provider: this.type,
        kind: 'unexpected_response',
        message: e?.message || 'Unexpected fal response',
      });
      return error;
    }
  }

  private parseSchema<R>(schema: ZodType<R>, data: unknown): R {
    const result = schema.safeParse(data);
    if (result.success) return result.data;
    const errors = JSON.stringify(result.error.errors);
    throw new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: `Unexpected fal response: ${errors}`,
    });
  }

  async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const model = this.selectModel(cond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, { model: model.id });

      // by default, image prompt assumes there is only one message
      const prompt = this.extractPrompt(messages[messages.length - 1]);

      const response = await fetch(`https://fal.run/fal-ai/${model.id}`, {
        method: 'POST',
        headers: {
          Authorization: `key ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...prompt,
          sync_mode: true,
          enable_safety_checks: false,
        }),
        signal: options.signal,
      });

      const data = this.parseSchema(FalResponseSchema, await response.json());
      if (!data.output) {
        throw this.extractFalError(data, 'Failed to generate text');
      }
      return data.output;
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions | CopilotImageOptions = {}
  ): AsyncIterable<string> {
    const model = this.selectModel(cond);

    try {
      metrics.ai.counter('chat_text_stream_calls').add(1, { model: model.id });
      const result = await this.text(cond, messages, options);

      yield result;
    } catch (e) {
      metrics.ai.counter('chat_text_stream_errors').add(1, { model: model.id });
      throw e;
    }
  }

  override async *streamImages(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotImageOptions = {}
  ): AsyncIterable<string> {
    const model = this.selectModel({
      ...cond,
      outputType: ModelOutputType.Image,
    });

    try {
      metrics.ai
        .counter('generate_images_stream_calls')
        .add(1, { model: model.id });

      // by default, image prompt assumes there is only one message
      const prompt = this.extractPrompt(
        messages[messages.length - 1],
        options as CopilotImageOptions
      );

      let data: FalResponse;
      if (model.id.startsWith('workflows/')) {
        const stream = await falStream(model.id, { input: prompt });
        data = this.parseSchema(
          FalStreamOutputSchema,
          await stream.done()
        ).output;
      } else {
        const response = await fetch(`https://fal.run/fal-ai/${model.id}`, {
          method: 'POST',
          headers: {
            Authorization: `key ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...prompt,
            sync_mode: true,
            seed: (options as CopilotImageOptions)?.seed || 42,
            enable_safety_checks: false,
          }),
          signal: options.signal,
        });
        data = this.parseSchema(FalResponseSchema, await response.json());
      }

      if (!data.images?.length && !data.image?.url) {
        throw this.extractFalError(data, 'Failed to generate images');
      }

      if (data.image?.url) {
        yield data.image.url;
        return;
      }

      const imageUrls =
        data.images
          ?.filter((image): image is NonNullable<FalImage> => !!image)
          .map(image => image.url) || [];

      for (const url of imageUrls) {
        yield url;
        if (options.signal?.aborted) {
          break;
        }
      }
      return;
    } catch (e) {
      metrics.ai
        .counter('generate_images_stream_errors')
        .add(1, { model: model.id });
      throw this.handleError(e);
    }
  }
}
